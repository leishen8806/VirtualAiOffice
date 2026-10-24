<#
push-snapshot.ps1 — 把 office3d 当前源码以「增量新分支」推送到 GitHub 仓库（董事会 2026-10-22 要求）。

安全设计（全部是硬性的）：
  * 默认只做到「本地提交 + 摘要」，不推送；必须显式加 -Push 才会推送。
  * 只推新分支；绝不强推；不碰 main；远端已存在同名分支则拒绝（除非 -AllowExisting，且仍然是普通推送，非快进会被远端拒绝）。
  * 在临时目录克隆、组装、提交，不会在 office3d 里创建 .git；结束后删除临时目录（-Keep 可保留）。
  * 排除规则与远端快照分支里的 office3d/.gitignore 一致（凭据、运行数据 JSON、聊天、账本、日志、备份、截图等），并额外：
      - 提交前做密钥特征扫描（私钥块、sk-/ghp_/github_pat_/AKIA/xox 令牌、Bearer 令牌、password=/secret= 赋值）：命中即中止；
      - 公网 IP 扫描（回环、私网、文档保留地址除外）：命中即中止（-AllowIp 可逐个放行）；
      - 敏感文件名检查（lan.json、telegram*、*.dpapi、.env*、*.pem、*.key、memory.json、账本、state-last-good.json 等）：命中即中止；
      - 单文件 > 50 MB 中止（GitHub 上限 100 MB）。
  * 不读取、不打印任何文件内容中的密钥；命中时只显示「文件:行号」与规则名。
  * 提交作者默认沿用基准分支最后一次提交的作者（通常是 noreply 邮箱），不使用本机全局 git 邮箱。

用法：
  powershell -NoProfile -File E:\VirtualAIOffice\paperclip-ops\office3d\tools\push-snapshot.ps1            # 演练：组装 + 扫描 + 本地提交 + 摘要
  powershell -NoProfile -File ...\push-snapshot.ps1 -Push                                                     # 真正推送新分支
  参数：-Branch 新分支名（默认 office3d/rev-yyyyMMdd，重名自动加 -2、-3）  -Base 基准分支（默认 auto = 最新的 office3d/rev-* 否则 snapshot/office3d-20261022）
        -Message 提交说明（默认自动生成）  -CoAuthor "Name <email>"  -Remote 远端  -AllowIp 放行的 IP  -Keep 保留临时目录
退出码：0 成功（或无变更）  2 密钥命中  3 公网 IP 命中  4 敏感文件名命中  5 超大文件  6 git 失败  7 分支已存在
#>
param(
  [string]$Remote = 'git@github.com:leishen8806/VirtualAiOffice.git',
  [string]$Base = 'auto',
  [string]$Branch = '',
  [string]$Message = '',
  [string]$CoAuthor = '',
  [string[]]$AllowIp = @(),
  [switch]$Push,
  [switch]$AllowExisting,
  [switch]$Keep
)
$ErrorActionPreference = 'Continue'
$Src = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Work = Join-Path ([IO.Path]::GetTempPath()) "office3d-push-$Stamp"
$LogFile = Join-Path $Src 'push-snapshot.log'

function Say([string]$text) { Write-Output "[push-snapshot] $text" }
function Fail([string]$text, [int]$code) { Say "已中止：$text"; Cleanup; exit $code }
function Cleanup { Set-Location -LiteralPath $Src -ErrorAction SilentlyContinue; if (-not $Keep -and (Test-Path -LiteralPath $Work)) { Remove-Item -LiteralPath $Work -Recurse -Force -ErrorAction SilentlyContinue } }
function GitRun { $out = & git @args 2>&1; $script:GitExit = $LASTEXITCODE; $out | ForEach-Object { $_.ToString() } }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail '本机没有 git。' 6 }

# 1) 远端分支与基准
$heads = GitRun ls-remote --heads $Remote
if ($script:GitExit -ne 0) { Fail "无法读取远端分支（网络或 SSH 授权问题）：$($heads | Select-Object -First 1)" 6 }
$names = @($heads | ForEach-Object { ($_ -split "`t")[1] -replace '^refs/heads/', '' } | Where-Object { $_ })
if ($Base -eq 'auto') {
  $rev = @($names | Where-Object { $_ -like 'office3d/rev-*' } | Sort-Object -Descending)
  $Base = if ($rev.Count) { $rev[0] } else { 'snapshot/office3d-20261022' }
}
if ($names -notcontains $Base) { Fail "远端没有基准分支 $Base。" 6 }
if (-not $Branch) {
  $Branch = 'office3d/rev-' + (Get-Date -Format 'yyyyMMdd')
  $n = 1; $candidate = $Branch
  while ($names -contains $candidate) { $n++; $candidate = "$Branch-$n" }
  $Branch = $candidate
}
if (($names -contains $Branch) -and -not $AllowExisting) { Fail "远端已存在分支 $Branch（如确需追加提交，请显式加 -AllowExisting；仍然是普通推送，不会强推）。" 7 }
if ($Branch -in @('main', 'master')) { Fail '不允许推送到 main / master。' 7 }
Say "远端 $Remote | 基准 $Base | 新分支 $Branch"

# 2) 克隆基准（浅克隆）
New-Item -ItemType Directory -Force -Path $Work | Out-Null
$clone = Join-Path $Work 'repo'
$o = GitRun clone --depth 1 --branch $Base --single-branch --quiet $Remote $clone
if ($script:GitExit -ne 0) { Fail "克隆失败：$($o | Select-Object -First 1)" 6 }
Set-Location $clone
# 中文文件名：关闭 git 的八进制转义并按 UTF-8 读输出，否则 Test-Path 找不到文件、扫描会漏掉它们
$null = GitRun config core.quotepath false
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$baseAuthor = (GitRun log -1 '--format=%an') | Select-Object -First 1
$baseEmail = (GitRun log -1 '--format=%ae') | Select-Object -First 1
$null = GitRun checkout -q -b $Branch
if (-not (Test-Path (Join-Path $clone 'office3d\.gitignore'))) { Fail '基准分支里没有 office3d/.gitignore，无法沿用排除规则；请先人工确认。' 6 }

# 3) 镜像当前源码（排除规则；.gitignore 保留基准版本）
$xf = @('blocked.json','chat.json','command-view.json','committee.json','contract-view.json','display-staff.json','evidence-version.json','gossip.json','handoff.json','lan.json','memory.json','multitenant.json','names.json','premium-audit.json','scheduler-view.json','standup.json','state-last-good.json','stats.json','telegram.json','town-home.json','town-nav.json','wall.json','workload.json','*.dpapi','*.log','*.tmp','*.bak*','.gitignore','.env*','*.pem','*.key')
$xd = @('_ref','artifacts','chats','events','office3d-backup-*','node_modules','.git')
$dst = Join-Path $clone 'office3d'
robocopy $Src $dst /MIR /XF @xf /XD @xd /NFL /NDL /NJH /NP /NS /NC /R:1 /W:1 | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "复制失败（robocopy 退出码 $LASTEXITCODE）。" 6 }
$null = GitRun add -A office3d
# 被忽略规则命中的、已被暂存的文件一律撤出（基准分支原本就有的不会被误删：只撤「本次新增」）
$ignored = @(GitRun ls-files -ci --exclude-standard)
foreach ($f in $ignored) {
  $null = GitRun cat-file -e "HEAD:$f"
  if ($script:GitExit -eq 0) { $null = GitRun reset -q HEAD -- $f; $null = GitRun checkout -- $f; $null = GitRun add -- $f }
  else { $null = GitRun rm -q --cached -- $f; Remove-Item -LiteralPath (Join-Path $clone $f) -Force -ErrorAction SilentlyContinue }
}

$changed = @(GitRun diff --cached --name-status)
if (-not $changed.Count) { Say '没有变更，无需提交。'; Cleanup; exit 0 }
$added = @($changed | Where-Object { $_ -match '^A' }).Count
$modified = @($changed | Where-Object { $_ -match '^M' }).Count
$deleted = @($changed | Where-Object { $_ -match '^D' }).Count
Say "变更：新增 $added / 修改 $modified / 删除 $deleted"
$files = @(GitRun diff --cached --name-only --diff-filter=AM)

# 4) 敏感文件名
$badName = '(^|/)(lan\.json|telegram[^/]*|[^/]*\.dpapi|\.env[^/]*|[^/]*\.pem|[^/]*\.key|memory\.json|gossip\.json|state-last-good\.json|ops-ssh\.log|INVENTORY\.md)$|(^|/)(ledger|chats|events)/'
$hit = @($files | Where-Object { $_ -match $badName -and $_ -notmatch '(^|/)telegram\.mjs$|(^|/)tests/' })
if ($hit.Count) { Fail ("敏感文件名：" + (($hit | Select-Object -First 8) -join ', ')) 4 }

# 5) 超大文件
$big = @($files | Where-Object { (Test-Path -LiteralPath (Join-Path $clone $_)) -and ((Get-Item -LiteralPath (Join-Path $clone $_)).Length -gt 50MB) })
if ($big.Count) { Fail ("单文件超过 50 MB：" + ($big -join ', ')) 5 }

# 6) 密钥特征扫描（只报「文件:行号:规则」，不打印内容）
$rules = [ordered]@{
  'PRIVATE_KEY' = 'BEGIN [A-Z ]*PRIVATE KEY'
  'OPENAI_STYLE_KEY' = 'sk-[A-Za-z0-9_-]{20,}'
  'GITHUB_TOKEN' = 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}'
  'AWS_KEY' = 'AKIA[0-9A-Z]{16}'
  'SLACK_TOKEN' = 'xox[baprs]-[A-Za-z0-9-]{10,}'
  'BEARER' = 'Bearer\s+[A-Za-z0-9._~+/=-]{20,}'
  'SECRET_ASSIGN' = '(?i)(password|passwd|secret|api[_-]?key|access[_-]?token)"?\s*[:=]\s*"[^"\s]{8,}"'
}
$secretHits = New-Object System.Collections.Generic.List[string]
$ipHits = New-Object System.Collections.Generic.List[string]
$ipRx = [regex]'\b(?:\d{1,3}\.){3}\d{1,3}\b'
$okIp = '^(127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|255\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)'
foreach ($f in $files) {
  $p = Join-Path $clone $f
  if (-not (Test-Path -LiteralPath $p)) { continue }
  if ($f -match '\.(png|jpe?g|webp|gif|glb|gltf|fbx|bin|woff2?|ttf|ico|mp4|webm|dds|ktx2?|wasm)$') { continue }
  $i = 0
  foreach ($line in [IO.File]::ReadLines($p)) {
    $i++
    foreach ($k in $rules.Keys) { if ($line -match $rules[$k]) { $secretHits.Add("${f}:${i}:$k") } }
    foreach ($m in $ipRx.Matches($line)) {
      $ip = $m.Value
      if ($ip -notmatch $okIp -and ($AllowIp -notcontains $ip) -and ($ip -match '^\d+\.\d+\.\d+\.\d+$') -and ((($ip -split '\.') | ForEach-Object { [int]$_ } | Where-Object { $_ -gt 255 }).Count -eq 0)) {
        # 版本号等点分数字无法与 IP 区分，保守按公网 IP 处理，需要时用 -AllowIp 放行
        $ipHits.Add("${f}:${i}:PUBLIC_IP")
      }
    }
  }
}
if ($secretHits.Count) { Say ("密钥特征命中（仅列位置）：`n  " + (($secretHits | Select-Object -First 12) -join "`n  ")); Fail "疑似密钥 $($secretHits.Count) 处。" 2 }
if ($ipHits.Count) { Say ("公网 IP 命中（仅列位置）：`n  " + (($ipHits | Select-Object -First 12) -join "`n  ")); Fail "疑似公网 IP $($ipHits.Count) 处；确认无害后用 -AllowIp 逐个放行。" 3 }
Say "扫描通过：密钥 0、公网 IP 0、敏感文件名 0、超大文件 0（扫描 $($files.Count) 个文件）。"

# 7) 提交
if (-not $Message) {
  $Message = "chore(office3d): incremental snapshot $(Get-Date -Format 'yyyy-MM-dd HH:mm')`n`nAdded $added, modified $modified, removed $deleted files on top of $Base.`nSame exclusion policy as the snapshot branch (no credentials, runtime JSON, chats, ledgers, logs, backups or screenshots).`nArchival upload: not a release and not a security certification."
}
if ($CoAuthor) { $Message += "`n`nCo-Authored-By: $CoAuthor" }
$msgFile = Join-Path $Work 'message.txt'
[IO.File]::WriteAllText($msgFile, $Message, (New-Object Text.UTF8Encoding $false))
$null = GitRun -c "user.name=$baseAuthor" -c "user.email=$baseEmail" commit -q -F $msgFile
if ($script:GitExit -ne 0) { Fail '提交失败。' 6 }
$sha = (GitRun rev-parse --short HEAD) | Select-Object -First 1
Say "已本地提交 $sha（作者 $baseAuthor <$baseEmail>）。"

# 8) 推送（仅 -Push）
if (-not $Push) {
  Say "演练完成：未推送。确认无误后加 -Push 重新运行（会重新组装一次并推送新分支 $Branch）。"
  Add-Content -LiteralPath $LogFile -Encoding UTF8 -Value ("{0}`tDRYRUN`t{1}`t{2}`tA{3}/M{4}/D{5}" -f (Get-Date -Format s), $Branch, $sha, $added, $modified, $deleted)
  Cleanup; exit 0
}
$out = GitRun push -u origin $Branch
if ($script:GitExit -ne 0) { Fail ("推送失败：" + ($out | Select-Object -Last 2 | Out-String)) 6 }
$verify = GitRun ls-remote --heads $Remote $Branch
Say "已推送：$($verify | Select-Object -First 1)"
Say "创建合并请求：$((($Remote -replace '^git@github.com:', 'https://github.com/') -replace '\.git$', ''))/pull/new/$Branch"
Add-Content -LiteralPath $LogFile -Encoding UTF8 -Value ("{0}`tPUSH`t{1}`t{2}`tA{3}/M{4}/D{5}" -f (Get-Date -Format s), $Branch, $sha, $added, $modified, $deleted)
Cleanup
exit 0
