# Runbook: first mainnet test (Windows, PowerShell 7)

Goal: generate 5 mainnet test keys offline, verify one in Zingo, import them, and test **Trust Wallet** against the three address types: Ironwood-only UA, full UA, transparent.

Rules for the whole session:

- Use **PowerShell 7** (`pwsh`), in a normal window (Windows Terminal is fine), not an IDE output panel. Keygen needs a real terminal to read the passphrase.
- Seeds exist in two places only: **Bitwarden** (typed in by hand) and the **encrypted** seeds file in `C:\Users\USER\Documents\ZecProofKeys`. Never in the repo, `.env`, `.env.mainnet` or a chat.
- **Type** seeds by hand. Don't copy-paste them: Windows clipboard history can keep them.
- Never run `docker compose down -v`. It deletes the record of which keys have been handed out.
- If something looks wrong, stop, don't click anything else on the test page, and send me the worker output.

---

## 0. Before going offline

```powershell
Set-Location C:\Users\USER\Projects\zecproof
git pull
npm install
npm run build
```

Expected: `npm run build` ends without errors.

Get the current mainnet height. It becomes the batch **birthday** (no funds can predate it):

```powershell
$H = (Invoke-RestMethod https://api.blockchair.com/zcash/stats).data.best_block_height
$H
```

Expected: a number around 3,500,000. **Write it down.** Zingo asks for it later, and the variables below are lost if you close this window.

Set the keys folder. It is outside the repo; keygen refuses any folder inside a git checkout:

```powershell
$Keys = 'C:\Users\USER\Documents\ZecProofKeys'
Remove-Item Env:ZECPROOF_KEYGEN_PASSPHRASE -ErrorAction SilentlyContinue
[Environment]::GetFolderPath('MyDocuments')
```

- The `Remove-Item` line makes sure keygen prompts you for the passphrase, instead of reading one from the environment.
- Expected from the last line: `C:\Users\USER\Documents`. If it shows a path under `OneDrive`, Documents is being synced to the cloud. In that case stop: choose a folder outside OneDrive and use it as `$Keys` everywhere below. (On this PC, Documents was local when I checked.)

**Choose the passphrase.** It encrypts the seeds file.
- Generate it with Bitwarden's generator: type **Passphrase**, 6 or more words. Keygen requires at least 12 characters.
- Save it **now, while online**, as a Bitwarden Login or Secure Note: "ZecProof keygen passphrase – mainnet batch 1". Bitwarden can't add items while offline.
- Also write it on paper and keep it somewhere safe. Without the passphrase the encrypted file is useless, and the paper copy keeps it usable even if you lose Bitwarden access.
- When keygen asks for it, **type** it rather than pasting.

Optional but recommended: Settings → System → Clipboard → turn off **Clipboard history** and **Share across devices** for this session.

---

## 1. Generate the 5-key batch offline

Turn off Wi-Fi (Win + A → Wi-Fi off) and unplug any Ethernet cable. Check:

```powershell
Test-Connection zec.rocks -Count 1 -Quiet
```

Expected: `False` (an error saying the name can't be resolved is also fine).

Generate:

```powershell
npm run keygen -w keygen -- generate --network mainnet --count 5 --birthday $H --out $Keys
```

What you should see:

1. `Passphrase for the encrypted seeds file:` Type it. Nothing is shown while you type.
2. `Repeat passphrase:`
3. `Generating 5 mainnet seed(s)…` This takes a few seconds.
4. A summary:
   - `Batch mainnet-YYYYMMDD-xxxxxx`
   - `Keys derived by: @ledgerhq/zcash-utils@2.5.0 testDeriveKeys(seed, account 0, "mainnet"); …`
   - the two file paths in `C:\Users\USER\Documents\ZecProofKeys`

The two files, both in `C:\Users\USER\Documents\ZecProofKeys`:

| File | Contains | Notes |
| --- | --- | --- |
| `mainnet-….seeds.enc.json` | 5 seeds, encrypted with your passphrase | Your backup besides Bitwarden. Don't move it into the repo, OneDrive, email or chat. The worker is never told where it is. |
| `mainnet-….public.json` | Viewing keys and addresses, no seeds | Used by `verify` and the import |

Keep the paths in variables:

```powershell
$Public = (Get-ChildItem "$Keys\mainnet-*.public.json" | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
$Seeds  = $Public -replace '\.public\.json$', '.seeds.enc.json'
$Public; $Seeds
```

If keygen says **"This machine appears to be online"** while Wi-Fi is off, Windows probably answered from its DNS cache.
- Run `ipconfig /flushdns` (in an Administrator PowerShell if it asks), then try again.
- Don't use `--allow-online`.

---

## 2. Save the seeds to Bitwarden (PC still offline)

Bitwarden can't add items while offline, so use **Bitwarden on your phone**, which stays online, while the PC stays offline and shows the seeds.

Do this for each index 0 to 4:

```powershell
npm run keygen -w keygen -- reveal --seeds $Seeds --index 0
```

Expected: `Passphrase:`, then `mainnet-YYYYMMDD-xxxxxx #0 (mainnet):` followed by 24 words.

- In Bitwarden on the phone, add a **Secure Note** named `ZecProof mainnet <batch id> #0`.
- **Type** the 24 words into it by hand, reading them off the PC screen. No photos, no copy-paste.
- Add `birthday <H>, ZIP-32 account 0` to the note.
- Read the words back against the screen, save, then run `Clear-Host` on the PC.
- Repeat with `--index 1`, `2`, `3`, `4`.

If you'd rather use Bitwarden on the PC, do this step after reconnecting in step 4. The seeds can be revealed again from the encrypted file at any time.

---

## 3. Restore seed 0 in Zingo mobile, without losing the treasury

**Important:** Zingo mobile holds **one wallet at a time**.
- Loading seed 0 **replaces** your treasury wallet in the app. The treasury's funds stay on-chain, but you can only get back into it with its seed phrase.
- Zingo keeps a "last wallet backup" you can switch back to. Don't rely on it alone.
- The menu names below come from Zingo 2.0.24's English text and may differ slightly in other versions.

**3a. Protect the treasury first.**
- In Zingo (treasury open), go to the menu → the seed / recovery info screen. It shows the 24-word seed **and the birthday**.
- Check that your Bitwarden entry `ZecProof treasury` has exactly those 24 words and that birthday. If not, type them into Bitwarden now. Do not continue until it does.
- On the Receive screen, note that the treasury address starts `u1k4cq54` and ends `wu0rf490`.

**3b. Switch to seed 0.**
- Menu → **Change to another Wallet**.
- Zingo shows the treasury seed again and warns: *"If you change to another wallet, you will no longer have access to this wallet without the seed phrase."* That's expected, because you saved it in 3a. Confirm.
- Choose **Restore wallet**. Enter seed 0's 24 words (from the step 2 output or Bitwarden).
- Set the birthday to `$H`, the number you wrote down, and make sure the chain is **Mainnet**.
- Zingo can restore in offline mode too. It shows addresses before it finishes syncing.

**3c. Note seed 0's addresses** on the Receive screen:
- the **shielded unified address** (`u1…`)
- the **transparent address** (`t1…`). Zingo shows a privacy warning on the transparent view; viewing it is fine.

You'll send both to the PC in step 5. Keep Zingo on seed 0 until `verify` passes.

**3d. Switch back to the treasury** (after step 5 passes):
- Menu → **Restore Last Wallet Backup** → confirm.
- Check that Receive shows `u1k4cq54…wu0rf490` and your balance comes back once synced.

**If the treasury doesn't come back** (the option is missing, or it restores the wrong wallet):
- Menu → **Change to another Wallet** → **Restore wallet** → enter the treasury's 24 words and the treasury birthday from 3a.
- Wait for the sync and confirm the address `u1k4cq54…wu0rf490`.
- The funds are on-chain, not in the app; the seed brings them back. Restoring takes longer with an earlier birthday, so use the one you saved.

---

## 4. Reconnect

```powershell
Clear-Host
$Public
```

- Close any other window that showed seeds.
- Turn Wi-Fi back on. Both files stay where they are; `$Public` still points at the public file in `C:\Users\USER\Documents\ZecProofKeys`.
- If you skipped step 2 to use Bitwarden on the PC, do step 2 now.

---

## 5. Verify seed 0 and import the batch

Send Zingo's two addresses from the phone to the PC, for example as a note-to-self message. They are public; that's fine. Then, in the same PowerShell window, so `$Public` is still set. If you opened a new one, run `$Public = (Get-ChildItem 'C:\Users\USER\Documents\ZecProofKeys\mainnet-*.public.json' | Sort-Object LastWriteTime | Select-Object -Last 1).FullName` first:

```powershell
$ZingoUa = 'u1...'   # paste the shielded unified address Zingo showed
$ZingoT  = 't1...'   # paste the transparent address Zingo showed
npm run keygen -w keygen -- verify --batch $Public --index 0 --address $ZingoUa --address $ZingoT
```

Expected:

```text
✔ Key 0 of mainnet-YYYYMMDD-xxxxxx matches the wallet: orchard, p2pkh
  Not checked (not derivable here): sapling
  Recorded in mainnet-YYYYMMDD-xxxxxx.public.json. The batch can now be imported.
```

- The order of `orchard, p2pkh` may vary.
- The `sapling` line appears only if Zingo's address includes a Sapling receiver.
- If you see `MISMATCH`, **stop, and don't import**. The usual cause is copying a second or rotated address instead of Zingo's first one. Try the first address it shows. If that still mismatches, send me the output.

Now go back to step 3d and switch Zingo back to the treasury.

Start the database and create the mainnet worker's env file. It deliberately has **no seed**:

```powershell
npm run db:up
npm run db:migrate
@'
DATABASE_URL=postgres://zecproof:zecproof@localhost:5432/zecproof
ZECPROOF_NETWORK=mainnet
ZECPROOF_ALLOW_MAINNET=yes
ZECPROOF_MAINNET_GRPC_URLS=https://na.zec.rocks:443,https://eu.zec.rocks:443,https://zaino.unsafe.zec.rocks:443
TEST_TTL_HOURS=48
'@ | Set-Content -Encoding utf8NoBOM .env.mainnet
git check-ignore .env.mainnet
```

Expected: `Migrations applied.`, then `.env.mainnet`. The last line confirms git will never commit the file.

Import:

```powershell
Set-Location worker
npx tsx --env-file=../.env.mainnet src/import-pool.ts $Public
Set-Location ..
```

Expected: `Imported 5 mainnet key(s) from mainnet-YYYYMMDD-xxxxxx.`

Possible refusals:
- `Batch is not verified` means step 5's `verify` didn't run on this file.
- `already imported` means it worked the first time.

---

## 6. Start the mainnet worker and the web app

**Window A: mainnet worker**

```powershell
Set-Location C:\Users\USER\Projects\zecproof\worker
Remove-Item Env:WORKER_TEST_MNEMONIC -ErrorAction SilentlyContinue
npx tsx --env-file=../.env.mainnet src/index.ts
```

Expected:

```text
worker    network=mainnet keys=pool confirmations=10 explorer=on
          endpoints: https://na.zec.rocks:443, https://eu.zec.rocks:443, https://zaino.unsafe.zec.rocks:443
          5 unused mainnet pool key(s)
using     https://na.zec.rocks:443 (tip 35xxxxx)
```

This loads `.env.mainnet` only, not `.env`, so the testnet seed is never visible to it. If you see `WORKER_TEST_MNEMONIC is set`, the variable is in this window's session. Close the window and open a new one. A testnet worker can keep running in its own window; they don't interfere.

**Window B: web app**

```powershell
Set-Location C:\Users\USER\Projects\zecproof
$env:ZECPROOF_ENABLE_MAINNET_TESTS = 'yes'
npm run dev:web
```

Open <http://localhost:3000>. Expected: the **mainnet** board, with a **Run a test** button and no testnet banner. The testnet board is still at `/testnet`.

**Add Trust Wallet as a mainnet service** (once):

```powershell
docker compose exec -T postgres psql -U zecproof -c "insert into services (slug, name, kind, website_url, notes, networks) values ('trust-wallet', 'Trust Wallet', 'wallet', 'https://trustwallet.com', 'Mobile wallet, tested as the sender.', '{mainnet}') on conflict (slug) do nothing;"
```

Expected: `INSERT 0 1`. Refresh the board: a **Trust Wallet** row appears with all three cells **Untested**.

---

## 7. Trust Wallet tests: Ironwood-only UA, then full UA, then transparent

Each test is a separate run and uses a fresh key. Do them in this order.

**Test 1: Ironwood-only UA**

1. Board → **Run a test** → Service **Trust Wallet**, Address type **Ironwood-only UA** → **Generate test address**.
2. Expected:
   - The page shows *Preparing address*, then within about 30 seconds *Waiting for payment*, with a `u1…` address and the privacy and "test funds aren't returned" warnings.
   - Window A logs `assigned  <test id>  ironwood_ua  pool key <id>  u1…`. This first test uses key 0, the seed you checked in Zingo.
3. Get the address to your phone (note-to-self message). On the phone, **check its first and last 8 characters** against the page.
4. In Trust Wallet, open your ZEC → **Send** → paste the address.
   - **If Trust Wallet refuses the address** (e.g. "invalid address"):
     - Screenshot the error. If you want, upload it somewhere that gives an `https://` link.
     - On the test page, under *Did the service refuse this address?*, type the exact error text, paste the screenshot link, and click **Mark address as rejected**.
     - Expected: the page shows *Address rejected · Community reported · Filed as a community report*, and the board cell shows *Address rejected · Community reported · Pending review*.
     - No funds were sent. Go to Test 2.
   - **If it accepts:** send **the smallest amount Trust Wallet allows** (try `0.001` ZEC). Trust Wallet adds its own network fee on top. Confirm the send.
5. After sending:
   - Within a few minutes of the transaction being mined (a block every ~75 s), Window A logs `seen  <test id>  → IRONWOOD  height …  txid …`. It may say SAPLING or TRANSPARENT instead; that is the result.
   - The page shows *Payment seen, confirming* and *Waiting for 10 confirmations and an independent block explorer check*.
   - About 13 minutes later, plus a little time for ZecBlock to index it, Window A logs `verified  <test id>  N confirmations, confirmed on ZecBlock`.
   - The page shows *Payment verified*. The board cell shows the pool plus **On-chain verified**, and the service page shows the txid, block, viewing key, *Confirmed on ZecBlock* and the "How to verify this yourself" line.
   - Window A may show `Waiting for explorer (…)` for a few minutes; that's normal. `Explorer disagrees` is **not** normal: stop and send me the output.

**Test 2: full UA.** Same steps, with Address type **Full UA**. If Trust Wallet sends, the result shows **which receiver it paid**: Ironwood (shielded) or Transparent.

**Test 3: transparent.** Same steps, with Address type **Transparent** (a `t1…` address). This is the baseline.

Budget check: at most 3 sends of the minimum plus fees. You'll have 2 unused keys left for retries.

---

## 8. Stopping safely

- **Worker (Window A):** Ctrl + C at any time.
  - Each step is saved separately, and an interrupted assignment is rolled back.
  - Restart with the same command; it resumes from the last scanned block.
  - A seen payment keeps confirming after a restart.
- **Web (Window B):** Ctrl + C. To hide mainnet tests again, start it in a **new** window without setting `ZECPROOF_ENABLE_MAINNET_TESTS`.
- **Database:** `npm run db:down` stops Postgres and keeps the data. **Never** add `-v`.
- **Unpaid tests** expire 48 hours after their address was assigned. A payment that arrives after that isn't recorded; the funds stay in that test key and can be recovered with its seed.
- **To switch mainnet off completely:** stop Window A and run the web app without the flag. `.env.mainnet` can stay; nothing reads it unless you pass it.

## 9. Later: returning test funds (optional)

Only worth it when a key holds more than a sweep fee.
1. In Zingo: **Change to another Wallet** → **Restore wallet** → the used test seed (birthday `$H`).
2. Send to the treasury. Check `u1k4cq54` … `wu0rf490` against `docs/SPEC.md` first.
3. Switch back to the treasury (step 3d).

Never sweep to a personal wallet or an exchange deposit address: each test's published viewing key shows where its funds went.

## Troubleshooting

| Message | Meaning / fix |
| --- | --- |
| `This machine appears to be online` | Wi-Fi/Ethernet still on, or a cached DNS answer: `ipconfig /flushdns`, retry |
| `No terminal to read a passphrase from` | Run keygen in a normal PowerShell window, not an IDE panel |
| `Passphrases do not match` | Retype; nothing was written |
| `Wrong passphrase, or the seeds file is damaged` | Check the Bitwarden passphrase entry; try the paper copy |
| `MISMATCH: the wallet's … receiver differs` | Don't import. Use Zingo's first address; else send me the output |
| `Batch is not verified` | Run step 5's `verify` on the same `$Public` file |
| `Mainnet is disabled` | `.env.mainnet` is missing `ZECPROOF_ALLOW_MAINNET=yes`, or you didn't pass `--env-file=../.env.mainnet` |
| `WORKER_TEST_MNEMONIC is set` | Open a new PowerShell window and use the step 6 command |
| `No unused mainnet keys in the pool` | Import didn't run, or all 5 keys are used: generate a new batch |
| `burned pool key …` | That key had on-chain history and was skipped. Fine unless it happens to every key |
| `Waiting for explorer (…)` | Normal for a few minutes after 10 confirmations |
| `Explorer disagrees (…)` | Stop. Don't mark the test; send me the test id and the worker output |
| No **Run a test** button on `/` | Window B wasn't started with `$env:ZECPROOF_ENABLE_MAINNET_TESTS = 'yes'` |
| Test page 404 | Mainnet tests live at `/test/<id>`, testnet ones at `/testnet/test/<id>` |
