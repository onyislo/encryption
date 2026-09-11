# Push to GitHub with Personal Access Token
# Usage: .\push-with-token.ps1

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "GitHub Push with Token Helper" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Get current remote
$currentRemote = git remote get-url origin
Write-Host "Current remote: $currentRemote" -ForegroundColor Yellow
Write-Host ""

# Check if already has token
if ($currentRemote -match "https://ghp_") {
    Write-Host "✓ Token already configured!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Pushing to onyislo/encryption..." -ForegroundColor Cyan
    git push origin main
} else {
    Write-Host "⚠ No token found in remote URL" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please enter your GitHub Personal Access Token:" -ForegroundColor Yellow
    Write-Host "(It should start with 'ghp_')" -ForegroundColor Gray
    Write-Host ""
    
    $token = Read-Host "Token" -MaskInput
    
    if ($token -ne "") {
        # Update remote with token
        git remote set-url origin "https://$token@github.com/onyislo/encryption.git"
        Write-Host ""
        Write-Host "✓ Token configured successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Pushing to onyislo/encryption..." -ForegroundColor Cyan
        git push origin main
    } else {
        Write-Host ""
        Write-Host "✗ No token provided. Exiting." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
