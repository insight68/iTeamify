CREATE UNIQUE INDEX CONCURRENTLY public_quote_acceptance_evidence_challenge_uidx
    ON public_quote_acceptance_evidence (verification_challenge_id)
    WHERE verification_challenge_id IS NOT NULL;
