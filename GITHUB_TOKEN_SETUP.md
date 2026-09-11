# GitHub Personal Access Token Setup

## Why Use Personal Access Token (PAT)?

GitHub requires authentication for pushing code. A Personal Access Token is more secure than using your password.

---

## Step 1: Create a Personal Access Token

1. **Go to GitHub** → https://github.com/settings/tokens

2. **Click "Generate new token"** → Select "Generate new token (classic)"

3. **Fill in the form:**
   - **Note:** `Encryption App Push Access`
   - **Expiration:** Choose duration (30 days, 60 days, 90 days, or No expiration)
   - **Select scopes:** 
     - ✅ Check **`repo`** (Full control of private repositories)
     - ✅ This gives you push access

4. **Click "Generate token"** at the bottom

5. **COPY THE TOKEN!** 
   - ⚠️ You can only see it ONCE!
   - It looks like: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Save it somewhere safe!

---

## Step 2: Update Git Remote to Use Token

### Option A: Include Token in URL (Easier)

```bash
# Replace YOUR_TOKEN with your actual token
git remote set-url origin https://YOUR_TOKEN@github.com/onyislo/encryption.git
```

**Example:**
```bash
git remote set-url origin https://ghp_abc123xyz789@github.com/onyislo/encryption.git
```

### Option B: Use Git Credential Manager (More Secure)

```bash
# Set credential helper
git config --global credential.helper manager

# Next push will prompt for credentials
# Username: onyislo
# Password: (paste your token here)
```

---

## Step 3: Test Push

```bash
git push origin main
```

If it asks for credentials:
- **Username:** `onyislo`
- **Password:** Paste your Personal Access Token (starts with `ghp_`)

---

## Alternative: Use GitHub CLI (gh)

If you have `gh` installed:

```bash
gh auth login
```

Follow the prompts and select:
- **GitHub.com**
- **HTTPS**
- **Paste an authentication token**
- Then paste your token

---

## Current Remote Status

Your current git remote is:
```
https://onyislo@github.com/onyislo/encryption.git
```

To add token authentication:
```bash
git remote set-url origin https://YOUR_TOKEN@github.com/onyislo/encryption.git
```

---

## Security Notes

⚠️ **Never commit your token to the repository!**
⚠️ **Never share your token with anyone!**
⚠️ **If exposed, regenerate it immediately!**

✅ Store it in a password manager
✅ Use Git Credential Manager for better security
✅ Set expiration dates for tokens

---

## Troubleshooting

### "Authentication failed"
- Token might be expired
- Token might not have correct permissions
- Generate a new token with `repo` scope

### "Permission denied"
- Make sure you're authenticated as `onyislo`
- Check if token has `repo` access
- Try regenerating the token

### "Token not working"
- Double-check you copied the entire token
- Make sure there are no extra spaces
- Token starts with `ghp_`

---

## Quick Commands

```bash
# Check current remote
git remote -v

# Update remote with token
git remote set-url origin https://YOUR_TOKEN@github.com/onyislo/encryption.git

# Push with token
git push origin main
```
