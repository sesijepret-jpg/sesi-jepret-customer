"""Windows print spooler adapter for two proportional 6x18 cm strips on A5."""

from io import BytesIO
from pathlib import Path
import subprocess
import tempfile

from PIL import Image


PRINTER_NAME = "Canon iP2700 series"
A5_PX = (1754, 2480)  # A5 at 300 dpi
STRIP_PX = (600, 1800)
PANEL_PX = (1417, 2126)  # Two 60x180 mm strips at 300 dpi
MAX_IMAGE_BYTES = 12 * 1024 * 1024


class PrintError(RuntimeError):
    pass


def check_printer(printer_name: str = PRINTER_NAME) -> None:
    script = Path(__file__).with_name("print_a5.ps1")
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
         "-File", str(script), "-PrinterName", printer_name, "-CheckOnly"],
        capture_output=True, text=True, timeout=15,
    )
    if result.returncode:
        raise PrintError((result.stdout or result.stderr).strip() or "Printer belum siap")


def create_a5_page(strip_png: bytes) -> Image.Image:
    if len(strip_png) > MAX_IMAGE_BYTES:
        raise PrintError("Ukuran foto terlalu besar")
    try:
        with Image.open(BytesIO(strip_png)) as source:
            source.load()
            if source.size != STRIP_PX:
                raise PrintError("Foto harus berukuran 600 x 1800 piksel")
            strip_with_background = Image.new("RGBA", source.size, "white")
            strip_with_background.alpha_composite(source.convert("RGBA"))
            strip = strip_with_background.convert("RGB")
    except PrintError:
        raise
    except Exception as exc:
        raise PrintError("File foto bukan PNG yang valid") from exc

    # One package contains two identical 2x6 strips on one pre-cut A5 sheet.
    panel = Image.new("RGB", (1200, 1800), "white")
    panel.paste(strip, (0, 0))
    panel.paste(strip, (600, 0))
    panel = panel.resize(PANEL_PX, Image.Resampling.LANCZOS)
    page = Image.new("RGB", A5_PX, "white")
    page.paste(panel, ((A5_PX[0] - panel.width) // 2, (A5_PX[1] - panel.height) // 2))
    return page


def print_strip(strip_png: bytes, printer_name: str = PRINTER_NAME) -> None:
    page = create_a5_page(strip_png)
    script = Path(__file__).with_name("print_a5.ps1")
    with tempfile.TemporaryDirectory(prefix="sesijepret-print-") as temp:
        image_path = Path(temp) / "page.png"
        page.save(image_path, format="PNG", dpi=(300, 300))
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
             "-File", str(script), "-ImagePath", str(image_path), "-PrinterName", printer_name],
            capture_output=True, text=True, timeout=90,
        )
        if result.returncode:
            detail = (result.stdout or result.stderr).strip()
            raise PrintError(detail[-500:] or "Gagal mengirim foto ke printer")
