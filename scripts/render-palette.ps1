$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$output = Join-Path $PSScriptRoot "..\outputs\prototypes\palette-a.png"
$output = [System.IO.Path]::GetFullPath($output)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $output) | Out-Null

function C([string]$hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function Brush([string]$hex) {
  return [System.Drawing.SolidBrush]::new((C $hex))
}

$bmp = [System.Drawing.Bitmap]::new(1600, 1000)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$g.FillRectangle((Brush "#081521"), 0, 0, 1600, 1000)
$g.FillRectangle((Brush "#0E2232"), 0, 0, 1080, 1000)
$g.FillRectangle((Brush "#0A1926"), 0, 0, 1080, 420)

$micro = [System.Drawing.Font]::new("Consolas", 10, [System.Drawing.FontStyle]::Regular)
$body = [System.Drawing.Font]::new("Microsoft YaHei UI", 11, [System.Drawing.FontStyle]::Regular)
$bodyBold = [System.Drawing.Font]::new("Microsoft YaHei UI", 12, [System.Drawing.FontStyle]::Bold)
$title = [System.Drawing.Font]::new("Microsoft YaHei UI", 40, [System.Drawing.FontStyle]::Bold)
$smallTitle = [System.Drawing.Font]::new("Microsoft YaHei UI", 18, [System.Drawing.FontStyle]::Bold)
$coverTitle = [System.Drawing.Font]::new("Microsoft YaHei UI", 22, [System.Drawing.FontStyle]::Bold)
$coverJp = [System.Drawing.Font]::new("Yu Mincho", 11, [System.Drawing.FontStyle]::Regular)
$data = [System.Drawing.Font]::new("Consolas", 12, [System.Drawing.FontStyle]::Regular)
$buttonFont = [System.Drawing.Font]::new("Microsoft YaHei UI", 11, [System.Drawing.FontStyle]::Bold)

$cream = Brush "#F3EAD8"
$creamSoft = Brush "#B9AE9D"
$muted = Brush "#7E8C95"
$red = Brush "#D94B3D"
$mint = Brush "#8FD3C1"
$brass = Brush "#D9A441"
$ink = Brush "#081521"

$g.DrawString("A / MIDNIGHT GAME BOX", $micro, $mint, 72, 54)
$g.DrawString("深夜游戏盒", $title, $cream, 64, 86)
$g.DrawString("Galgame / AVG 本地游戏库 · A 游戏启动器配色提案", $body, $creamSoft, 72, 176)
$g.DrawString("实体包装盒的墨蓝、奶油盒面、樱桃红标签、薄荷状态与黄铜读数。", $body, $muted, 72, 210)

$swatches = @(
  @{ Name = "墨蓝"; Hex = "#081521"; Use = "应用底色 / 窗口外壳" },
  @{ Name = "盒面奶油"; Hex = "#F3EAD8"; Use = "标题 / 按钮文字 / 包装边缘" },
  @{ Name = "标签红"; Hex = "#D94B3D"; Use = "启动 / 选中 / 标签" },
  @{ Name = "状态薄荷"; Hex = "#8FD3C1"; Use = "在玩 / 可用 / 焦点" },
  @{ Name = "数据黄铜"; Hex = "#D9A441"; Use = "时长 / 次数 / 编号" }
)

$x = 72
$y = 300
foreach ($s in $swatches) {
  $rect = [System.Drawing.Rectangle]::new($x, $y, 176, 118)
  $g.FillRectangle((Brush $s.Hex), $rect)
  $penColor = if ($s.Hex -eq "#081521") { "#F3EAD8" } else { "#081521" }
  $g.DrawRectangle([System.Drawing.Pen]::new((C $penColor), 1), $rect)
  $g.DrawString($s.Name, $bodyBold, (Brush $penColor), ($x + 12), ($y + 12))
  $g.DrawString($s.Hex, $micro, (Brush $penColor), ($x + 12), ($y + 82))
  $g.DrawString($s.Use, $body, $creamSoft, $x, ($y + 132))
  $x += 196
}

$g.DrawString("组件取样", $smallTitle, $cream, 72, 512)

$buttonRect = [System.Drawing.Rectangle]::new(72, 556, 168, 46)
$g.FillRectangle($red, $buttonRect)
$g.DrawString("启动游戏", $buttonFont, $cream, 102, 568)

$ghostRect = [System.Drawing.Rectangle]::new(256, 556, 148, 46)
$g.DrawRectangle([System.Drawing.Pen]::new((C "#F3EAD8"), 1), $ghostRect)
$g.DrawString("游戏详情", $buttonFont, $cream, 284, 568)

$chipRect = [System.Drawing.Rectangle]::new(430, 556, 66, 30)
$g.FillRectangle((Brush "#122538"), $chipRect)
$g.DrawRectangle([System.Drawing.Pen]::new((C "#8FD3C1"), 1), $chipRect)
$g.DrawString("在玩", $body, $mint, 448, 561)

$g.DrawString("累计 12 小时 24 分   ·   14 次启动   ·   4.8 GB", $data, $brass, 72, 632)

$g.DrawString("红色只承担启动与选中；薄荷只承担可玩/可用；黄铜只承担读数。", $body, $muted, 72, 700)
$g.DrawString("A 游戏启动器 · MiyuManager", $micro, $muted, 72, 936)

$box = [System.Drawing.Rectangle]::new(1168, 86, 356, 536)
$g.FillRectangle((Brush "#06111A"), $box)
$g.DrawRectangle([System.Drawing.Pen]::new((C "#F3EAD8"), 2), $box)
$g.FillRectangle($red, 1168, 86, 10, 536)
$g.FillEllipse((Brush "#E8DCC3"), 1288, 154, 172, 172)
$g.FillEllipse((Brush "#07121D"), 1326, 214, 40, 46)
$g.FillRectangle((Brush "#07121D"), 1306, 258, 80, 300)
$g.FillRectangle($red, 1320, 274, 52, 24)
$g.DrawString("月影工房", $coverTitle, $cream, 1196, 530)
$g.DrawString("月影のアトリエ", $coverJp, $creamSoft, 1198, 566)
$g.DrawString("LUNAR ATELIER · 2024", $micro, $brass, 1198, 594)
$g.DrawString("包装盒 / 2:3", $micro, $muted, 1198, 646)

$g.Dispose()
$bmp.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output $output
