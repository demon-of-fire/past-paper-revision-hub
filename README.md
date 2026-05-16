# Past Paper Revision Hub

Accessible dark-mode prototype for finding real past papers, converting them to Word documents locally, and marking uploaded answers against mark-scheme signals.

## Recommended Install

For normal users, build and share the Windows installer:

```powershell
powershell -ExecutionPolicy Bypass -File build-installer.ps1
```

or:

```powershell
npm run build:installer
```

This creates:

```text
PastPaperRevisionHubSetup-LATEST.exe
```

The setup EXE installs the app into the user's device, downloads the local Node and Python runtimes, installs the free PDF-to-Word converter, and creates Start Menu/Desktop shortcuts.

## Developer Run

Developers can still run it directly:

```powershell
npm start
```

On first launch, the app checks whether the free local PDF-to-Word converter is installed. If it is missing, it installs the converter automatically and writes `.setup-complete.json`, so the setup is skipped on later launches.

Manual setup is still available if needed:

```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

or:

```powershell
npm run setup
```

The converter dependencies are:

- `pdf2docx`
- its required Python PDF conversion libraries

## Run

```powershell
node server.js
```

Or:

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:4173/
```

## What works now

- Dark-mode app shell
- Keyboard and screen-reader-friendly structure
- Filters for qualification, subject, exam board, tier, paper, and search
- Real paper records across AQA, OCR, Edexcel, Eduqas, and Cambridge International sources
- Local PDF-to-Word conversion for question papers
- Local PDF-to-Word conversion for mark schemes
- Upload flow for completed answer files
- Question-by-question marking feedback
- Main-menu catalogue update button for refreshing discoverable paper metadata
- Progress summary stored in the browser

## Notes

The converter runs on the user's computer. Original PDFs are fetched from the source URL, converted locally, and returned to the browser as `.docx`.
