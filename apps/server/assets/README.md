# Server assets

## common-passwords.txt

Passwords rejected by the password policy (FR-008, research R7).

- Source: [SecLists](https://github.com/danielmiessler/SecLists) — `Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt`
  (the UK NCSC list of the 100,000 most used passwords from breach data). SecLists is MIT licensed.
- Only entries of 10+ characters are kept: shorter passwords already fail the length rule.
- Entries are lowercased; the check is case-insensitive. One password per line, UTF-8.
