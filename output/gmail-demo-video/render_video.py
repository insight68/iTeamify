from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parent
FRAMES = ROOT / 'frames'
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

def run(args):
    subprocess.run(args, check=True)

clips = [json.loads(p.read_text()) for p in sorted(FRAMES.glob('*/capture.json'))]
lines = ['ffconcat version 1.0']
offsets = []
total = 0.0
for clip in clips:
    offsets.append(total)
    frames = clip['frames']
    for i, frame in enumerate(frames):
        end = frames[i + 1]['at'] if i + 1 < len(frames) else clip['duration']
        lines += [f"file '{FRAMES / clip['name'] / frame['file']}'", f"duration {end - frame['at']:.6f}"]
    total += clip['duration']
lines.append(f"file '{FRAMES / clips[-1]['name'] / clips[-1]['frames'][-1]['file']}'")
(ROOT / 'frames.ffconcat').write_text('\n'.join(lines) + '\n')

narrations = [
    'This is the current Gmail connection in Aurocreator. The existing account shows email synchronization and automatic analysis.',
    'Selecting Add Gmail account opens Google authorization. The current application requests read-only Gmail access. Google identifies the application as Aurocreator.',
    'Google displays an unverified application notice. This recording stops before granting access. The authorization flow is not completed.',
    'We return to the existing connection. Gmail sending is not implemented in this build, and no message was sent. This video demonstrates the current connection workflow. It is not a completed Gmail send verification demonstration.',
]
audio_concat = ['ffconcat version 1.0']
for i, (clip, narration) in enumerate(zip(clips, narrations)):
    source = ROOT / f'narration-{i + 1}.txt'
    source.write_text(narration)
    aiff = ROOT / f'narration-{i + 1}.aiff'
    wav = ROOT / f'narration-{i + 1}.wav'
    if not aiff.exists() or aiff.stat().st_size <= 4096:
        run(['/usr/bin/say', '-v', 'Samantha', '-r', '175', '-f', str(source), '-o', str(aiff)])
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(aiff)]))
    speech_duration = float(probe['format'].get('duration', 0))
    if not 0 < speech_duration < clip['duration']:
        raise RuntimeError(f'Invalid narration duration for clip {i + 1}: {speech_duration}')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(aiff), '-af', 'apad', '-t', str(clip['duration']), '-ar', '48000', '-ac', '2', str(wav)])
    audio_concat.append(f"file '{wav}'")
(ROOT / 'audio.ffconcat').write_text('\n'.join(audio_concat) + '\n')
run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(ROOT / 'audio.ffconcat'), '-c:a', 'pcm_s16le', str(ROOT / 'narration.wav')])

def text_file(name, text):
    path = ROOT / name
    path.write_text(text)
    return path

filters = ['[0:v]scale=1840:850:flags=lanczos:out_range=tv,format=yuv420p,setsar=1,pad=1920:1080:40:110:color=0x101c2d[v0]']
captions = [
    ('Existing Gmail connection: synchronization and automatic analysis.', 'Recorded from www.aurocreator.com/build/connections.'),
    ('Add Gmail account opens Google OAuth. Current scope: gmail.readonly.', 'The account selection page identifies the app as aurocreator.'),
    ('Google displays an unverified-app notice.', 'No permission is granted; the OAuth flow is not completed.'),
    ('Returning to the existing connection. No email was sent.', 'This build does not implement gmail.send. This is not a complete send verification demo.'),
]
overlay_inputs = []
for i, caption in enumerate(captions):
    end = offsets[i] + clips[i]['duration']
    overlay = ROOT / f'caption-overlay-{i}.png'
    # These are new typography layers for the video. Source captures are untouched.
    command = ['magick', '-size', '1920x1080', 'xc:none', '-gravity', 'NorthWest', '-font', BOLD, '-pointsize', '34', '-fill', 'white', '-annotate', '+40+24', 'Aurocreator | Gmail connection walkthrough', '-font', FONT, '-pointsize', '19', '-fill', '#f3c780', '-annotate', '+40+73', 'LIVE APPLICATION CAPTURE  |  Current build  |  Gmail sending not demonstrated', '-pointsize', '26', '-fill', 'white']
    for line_number, text in enumerate(caption):
        command += ['-annotate', f'+40+{973 + 37 * line_number}', text]
    run(command + [str(overlay)])
    overlay_inputs += ['-loop', '1', '-i', str(overlay)]
    filters.append(f"[v{i}][{i+2}:v]overlay=enable='between(t,{offsets[i]:.6f},{end:.6f})'[v{i+1}]")
mask = ROOT / 'account-mask-overlay.png'
run(['magick', '-size', '1920x1080', 'xc:none', '-fill', '#f0f2f5', '-draw', 'rectangle 989,460 1585,536', '-gravity', 'NorthWest', '-font', FONT, '-pointsize', '23', '-fill', '#626d7a', '-annotate', '+1040+480', 'Other signed-in account hidden', str(mask)])
overlay_inputs += ['-loop', '1', '-i', str(mask)]
filters.append("[v4][6:v]overlay=enable='between(t,11.04,24.3)'[out]")
(ROOT / 'video-filter.txt').write_text(';'.join(filters))
output = ROOT / 'aurocreator-gmail-current-workflow.mp4'
run(['ffmpeg', '-y', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', str(ROOT / 'frames.ffconcat'), '-i', str(ROOT / 'narration.wav'), *overlay_inputs, '-filter_complex_script', str(ROOT / 'video-filter.txt'), '-map', '[out]', '-map', '1:a', '-r', '30', '-t', str(total), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-metadata', 'title=Aurocreator Gmail current workflow', '-metadata', 'comment=Live browser capture at approximately 5 samples per second with editorial captions and synthesized English narration. No Gmail send was demonstrated. OAuth consent was not completed.', str(output)])
(ROOT / 'recording-metadata.json').write_text(json.dumps({'duration_seconds':total,'width':1920,'height':1080,'capture':'Live browser screenshots sampled during actual UI actions; variable source frame rate, encoded at 30 fps.','audio':'Synthesized English narration, Samantha.','limitations':['Current implementation requests gmail.readonly.','OAuth consent not completed.','No Gmail send action is implemented or demonstrated.'],'redaction':'One unrelated signed-in Google account was covered with an explicit label.','segments':[{'name':c['name'],'start':offsets[i],'duration':c['duration'],'captured_frames':len(c['frames'])} for i,c in enumerate(clips)]},indent=2))
print(output)
