param(
    [string]$ImagePath,
    [Parameter(Mandatory=$true)][string]$PrinterName,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$document = New-Object System.Drawing.Printing.PrintDocument
$image = $null
try {
    $document.PrinterSettings.PrinterName = $PrinterName
    if (-not $document.PrinterSettings.IsValid) { throw "Printer $PrinterName tidak terpasang." }
    $printer = Get-CimInstance Win32_Printer | Where-Object Name -EQ $PrinterName | Select-Object -First 1
    if ($null -eq $printer -or $printer.WorkOffline) { throw "Printer $PrinterName sedang offline. Periksa daya dan kabel USB." }
    if ($CheckOnly) { Write-Output 'READY'; return }
    if (-not $ImagePath -or -not (Test-Path -LiteralPath $ImagePath)) { throw 'File cetak tidak ditemukan.' }
    $a5 = $document.PrinterSettings.PaperSizes | Where-Object Kind -EQ A5 | Select-Object -First 1
    if ($null -eq $a5) { throw "Driver printer tidak menyediakan ukuran A5." }
    $document.DefaultPageSettings.PaperSize = $a5
    $document.DefaultPageSettings.Landscape = $false
    $document.DefaultPageSettings.Color = $true
    $document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
    $high = $document.PrinterSettings.PrinterResolutions | Where-Object Kind -EQ High | Select-Object -First 1
    if ($null -ne $high) { $document.DefaultPageSettings.PrinterResolution = $high }
    $document.PrinterSettings.Copies = 1
    $document.DocumentName = 'SesiJepret - 2 strip A5'
    $document.PrintController = New-Object System.Drawing.Printing.StandardPrintController
    $image = [System.Drawing.Image]::FromFile($ImagePath)
    $handler = [System.Drawing.Printing.PrintPageEventHandler] {
        param($sender, $event)
        # Printer graphics start at the printable area. Offset its hard margins
        # to make image coordinates refer to the physical A5 sheet.
        $event.Graphics.TranslateTransform(-$event.PageSettings.HardMarginX, -$event.PageSettings.HardMarginY)
        $event.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $event.Graphics.DrawImage($image, 0, 0, $a5.Width, $a5.Height)
        $event.HasMorePages = $false
    }
    $document.add_PrintPage($handler)
    $document.Print()
    Write-Output 'Pekerjaan diterima Windows print spooler.'
} catch {
    Write-Output $_.Exception.Message
    exit 1
} finally {
    if ($null -ne $image) { $image.Dispose() }
    $document.Dispose()
}
