param(
  [string]$RepoUrl = "https://github.com/lj1270998580-crypto/Skill-Space.git",
  [string]$SourceDir = "D:\Skill-Space\source\Skill-Space",
  [string]$DataRoot = "D:\Skill-Space",
  [switch]$ForceClone,
  [switch]$SkipBuild,
  [switch]$SkipInstaller,
  [switch]$InteractiveInstaller,
  [switch]$SkipWslSkills
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "[Skill-Space] $Message"
}

function Copy-SkillFolder([string]$Source, [string]$DestinationRoot) {
  if (-not (Test-Path -LiteralPath $Source)) {
    return
  }
  New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null
  $target = Join-Path $DestinationRoot (Split-Path -Leaf $Source)
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
  Copy-Item -LiteralPath $Source -Destination $target -Recurse -Force
}

function Convert-WindowsPathToWsl([string]$Path) {
  try {
    $converted = & wsl.exe wslpath -a $Path 2>&1
  } catch {
    return $null
  }
  if ($LASTEXITCODE -ne 0 -or -not $converted) {
    return $null
  }
  return $converted.Trim()
}

function Quote-Sh([string]$Value) {
  return "'" + $Value.Replace("'", "'\''") + "'"
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..") -ErrorAction SilentlyContinue
$localPackage = if ($repoRoot) { Join-Path $repoRoot "package.json" } else { "" }

if ((-not $ForceClone) -and $repoRoot -and (Test-Path -LiteralPath $localPackage)) {
  $sourcePath = $repoRoot.Path
  Write-Step "Using local repository: $sourcePath"
} else {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "git is required to clone Skill-Space from GitHub."
  }
  if (Test-Path -LiteralPath $SourceDir) {
    Write-Step "Repository already exists: $SourceDir"
    $sourcePath = (Resolve-Path $SourceDir).Path
  } else {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SourceDir) | Out-Null
    Write-Step "Cloning $RepoUrl to $SourceDir"
    git clone $RepoUrl $SourceDir
    if ($LASTEXITCODE -ne 0) {
      throw "git clone failed."
    }
    $sourcePath = (Resolve-Path $SourceDir).Path
  }
}

if (-not (Test-Path -LiteralPath (Join-Path $sourcePath "package.json"))) {
  throw "No package.json found in $sourcePath."
}

New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null

if (-not $SkipBuild) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is required to build the Skill-Space installer."
  }
  Push-Location $sourcePath
  try {
    Write-Step "Installing npm dependencies"
    npm ci
    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed."
    }

    Write-Step "Building Windows installer"
    npm run dist:win
    if ($LASTEXITCODE -ne 0) {
      throw "npm run dist:win failed."
    }
  } finally {
    Pop-Location
  }
}

$installer = Get-ChildItem -Path (Join-Path $sourcePath "release") -Filter "Skill-Space-Setup-*.exe" -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $installer) {
  Write-Step "Installer not found. App install step skipped."
} elseif ($SkipInstaller) {
  Write-Step "Installer created: $($installer.FullName)"
} else {
  $args = if ($InteractiveInstaller) { @() } else { @("/S") }
  Write-Step "Running installer: $($installer.FullName)"
  Start-Process -FilePath $installer.FullName -ArgumentList $args -Wait
}

$skillSourceRoot = Join-Path $sourcePath "skills"
$skillNames = @("skill-space", "skill-space-capture")
$windowsSkillRoots = @(
  (Join-Path $DataRoot "skills"),
  (Join-Path $env:USERPROFILE ".codex\skills"),
  (Join-Path $env:USERPROFILE ".agents\skills"),
  (Join-Path $env:USERPROFILE ".claude\skills"),
  (Join-Path $env:USERPROFILE ".openclaw\skills")
)

Write-Step "Installing bundled skills on Windows"
foreach ($skillName in $skillNames) {
  $skillSource = Join-Path $skillSourceRoot $skillName
  foreach ($destination in $windowsSkillRoots) {
    Copy-SkillFolder $skillSource $destination
  }
}

if (-not $SkipWslSkills -and (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
  $wslSkillRoot = Convert-WindowsPathToWsl $skillSourceRoot
  if ($wslSkillRoot) {
    Write-Step "Installing bundled skills inside the default WSL distro"
    $destinations = @("~/.codex/skills", "~/.agents/skills", "~/.claude/skills", "~/.openclaw/skills", "~/.hermes/skills")
    foreach ($destination in $destinations) {
      $commands = @("mkdir -p $destination")
      foreach ($skillName in $skillNames) {
        $commands += "cp -R " + (Quote-Sh "$wslSkillRoot/$skillName") + " $destination/"
      }
      try {
        & wsl.exe sh -lc ($commands -join " && ") | Out-Null
      } catch {
        Write-Step "WSL skill install skipped for $destination"
      }
    }
  }
}

Write-Step "Done"
Write-Host ""
Write-Host "Repository: $sourcePath"
Write-Host "Installer:  $($installer.FullName)"
Write-Host "DataRoot:   $DataRoot"
Write-Host "Skills:     $($skillNames -join ', ')"
