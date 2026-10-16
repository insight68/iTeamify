package gmail

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"net/textproto"
	"strings"
	"time"

	"github.com/iteamify-ai/iteamify/server/internal/util"
	db "github.com/iteamify-ai/iteamify/server/pkg/db/generated"
)

func (s *Service) buildOutboundMIME(ctx context.Context, row db.OutboundEmail) ([]byte, error) {
	if _, err := normalizeDraft(EmailDraft{To: row.ToAddresses, Cc: row.CcAddresses, Bcc: row.BccAddresses, Subject: row.Subject, Body: row.Body}); err != nil {
		return nil, err
	}
	from, err := mail.ParseAddress(row.FromAddress)
	if err != nil || strings.ContainsAny(row.FromAddress, "\r\n\x00") {
		return nil, ErrInvalidDraft
	}
	var out bytes.Buffer
	mixed := multipart.NewWriter(&out)
	fmt.Fprintf(&out, "From: %s\r\nTo: %s\r\n", from.String(), strings.Join(row.ToAddresses, ",\r\n "))
	if len(row.CcAddresses) > 0 {
		fmt.Fprintf(&out, "Cc: %s\r\n", strings.Join(row.CcAddresses, ",\r\n "))
	}
	// Gmail derives the envelope recipients from the raw MIME and strips Bcc
	// from delivered copies. The Bcc header must be included in the API input.
	if len(row.BccAddresses) > 0 {
		fmt.Fprintf(&out, "Bcc: %s\r\n", strings.Join(row.BccAddresses, ",\r\n "))
	}
	fmt.Fprintf(&out, "Subject: %s\r\nDate: %s\r\nMessage-ID: <iteamify-%s@%s>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=%q\r\n\r\n",
		mime.QEncoding.Encode("utf-8", row.Subject), row.QueuedAt.Time.Format(time.RFC1123Z),
		util.UUIDToString(row.ID), strings.SplitN(from.Address, "@", 2)[1], mixed.Boundary())
	part, err := mixed.CreatePart(textproto.MIMEHeader{"Content-Type": {"text/plain; charset=utf-8"}, "Content-Transfer-Encoding": {"quoted-printable"}})
	if err != nil {
		return nil, err
	}
	writer := quotedprintable.NewWriter(part)
	if _, err := writer.Write([]byte(row.Body)); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	var attachments []storedEmailAttachment
	if err := json.Unmarshal(row.Attachments, &attachments); err != nil {
		return nil, err
	}
	if len(attachments) > 10 {
		return nil, ErrInvalidDraft
	}
	var total int64
	for _, a := range attachments {
		total += a.SizeBytes
		if total > maxOutboundAttachmentBytes || strings.ContainsAny(a.Filename+a.ContentType, "\r\n\x00") {
			return nil, ErrInvalidDraft
		}
		data, err := s.readEmailAttachment(ctx, a)
		if err != nil {
			return nil, err
		}
		contentType := a.ContentType
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		if _, _, err := mime.ParseMediaType(contentType); err != nil {
			return nil, ErrInvalidDraft
		}
		part, err := mixed.CreatePart(textproto.MIMEHeader{"Content-Type": {contentType},
			"Content-Disposition":       {mime.FormatMediaType("attachment", map[string]string{"filename": a.Filename})},
			"Content-Transfer-Encoding": {"base64"}})
		if err != nil {
			return nil, err
		}
		encoded := base64.StdEncoding.EncodeToString(data)
		for len(encoded) > 0 {
			n := min(76, len(encoded))
			if _, err := fmt.Fprintf(part, "%s\r\n", encoded[:n]); err != nil {
				return nil, err
			}
			encoded = encoded[n:]
		}
	}
	if err := mixed.Close(); err != nil {
		return nil, err
	}
	if out.Len() > 25<<20 {
		return nil, ErrInvalidDraft
	}
	return out.Bytes(), nil
}
