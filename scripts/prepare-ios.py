from pathlib import Path
import json
import re
import subprocess

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
output = root / "ios" / "Generated"
catalog = output / "Assets.xcassets"
icons = catalog / "AppIcon.appiconset"
icons.mkdir(parents=True, exist_ok=True)
html = (dist / "index.html").read_text(encoding="utf-8")

def inline_script(match):
    source = (dist / match[1]).read_text(encoding="utf-8")
    source = re.sub(r"</script", lambda value: r"<\/" + value[0][2:], source, flags=re.I)
    return '<script type="module">' + source + "</script>"

def inline_style(match):
    return "<style>" + (dist / match[1]).read_text(encoding="utf-8") + "</style>"

html, js_count = re.subn(r'<script type="module" crossorigin src="\./([^"]+)"></script>', inline_script, html)
html, css_count = re.subn(r'<link rel="stylesheet" crossorigin href="\./([^"]+)">', inline_style, html)
if js_count != 1 or css_count != 1:
    raise SystemExit("Unexpected Vite output. Expected one local JS bundle and one stylesheet.")
(output / "WorldForge.html").write_text(html, encoding="utf-8")
(catalog / "Contents.json").write_text(json.dumps({"info": {"author": "xcode", "version": 1}}))
(icons / "Contents.json").write_text(json.dumps({
    "images": [{"filename": "Icon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
    "info": {"author": "xcode", "version": 1},
}))
subprocess.run(["sips", "-z", "1024", "1024", "-s", "format", "jpeg", "-s", "formatOptions", "100",
                str(root / "build" / "icon.png"), "--out", str(output / "Icon.jpg")], check=True)
subprocess.run(["sips", "-s", "format", "png", str(output / "Icon.jpg"), "--out", str(icons / "Icon.png")], check=True)
(output / "Icon.jpg").unlink()
