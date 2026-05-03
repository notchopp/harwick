# Load .env.local
$envContent = Get-Content .env.local -Raw
$lines = $envContent -split "`n"

foreach ($line in $lines) {
    if ($line -match "^\s*([^=]+)=(.*)$") {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        if ($value) {
            Set-Item -Path "env:$name" -Value $value
        }
    }
}

# Run test
node test-run-e2e.js
