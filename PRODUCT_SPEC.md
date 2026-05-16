# Exam Revision App Product Spec

## Core idea

A dark-mode, screen-reader-accessible revision app for finding past papers, downloading them as Word documents, completing them offline, and uploading the finished document to be marked against the official mark scheme.

The app should eventually become a complete revision hub with past papers, mark schemes, flashcards, progress tracking, and revision planning.

## Target users

- GCSE and A level students
- Students using NVDA or keyboard-only navigation
- Tutors and teachers assigning past-paper practice
- Students who prefer editable Word documents over PDFs

## First version

The first version should focus on past papers and marking.

### Paper finder

Users can filter by:

- Qualification: GCSE, A level, AS level, IGCSE
- Subject: maths, English, biology, chemistry, physics, computer science, etc.
- Exam board: AQA, Edexcel, OCR, WJEC, Eduqas, CCEA, Cambridge International
- Tier or level: higher, foundation, ordinary, advanced, where relevant
- Paper: paper 1, paper 2, paper 3, non-calculator, calculator, listening, reading, writing, etc.
- Year and exam series: June 2024, November 2023, specimen, sample assessment material

Each result should show:

- Paper title
- Exam board
- Qualification
- Subject
- Tier
- Paper number or component
- Year and series
- Download question paper button
- Download mark scheme button
- Mark my answer button
- Status: not started, downloaded, submitted, marked

### Word document downloads

The app should provide question papers as `.docx` files, not PDFs.

Important note: most exam boards publish papers as PDFs. The app will need a conversion pipeline:

- Download or ingest official PDF papers
- Convert PDFs to accessible Word documents
- Preserve question numbers, tables, diagrams, marks, and page structure
- Add alternative text or descriptions for diagrams where possible
- Keep the original official PDF link for verification

For some papers, especially maths/science papers with diagrams, formulae, or complex layouts, conversion may need manual review before release.

### Marking workflow

Beside every paper, users can select `Mark`.

The workflow:

1. User chooses a completed `.docx` answer file.
2. App checks that the uploaded file matches the selected paper.
3. App extracts answers from the Word document.
4. App compares the answers with the mark scheme.
5. App returns:
   - Total mark
   - Grade estimate, where boundaries are available
   - Question-by-question marks
   - Missed marks
   - Feedback written in plain language
   - Revision topics to practise next

Marking should support two modes:

- Objective marking: multiple choice, short answers, calculations, definitions.
- Assisted marking: longer written answers, essays, explanations, and source analysis.

Long-answer marking should be presented as an estimate unless reviewed by a human, because official mark schemes often require judgement.

## Accessibility requirements

The app must work well with NVDA from the first version.

Requirements:

- Fully keyboard accessible
- Semantic HTML controls, not custom clickable divs
- Visible focus outlines
- Skip-to-main-content link
- Proper headings in order
- Labels for every form control
- Accessible names for icon buttons
- Live regions for upload, marking, and progress status
- No information conveyed by colour alone
- Strong contrast in dark mode
- Table views must have proper headers
- Search/filter results must announce updates
- Dialogs must trap focus and return focus correctly
- Download and mark buttons must say exactly which paper they relate to

## Dark mode design

The whole app should be dark by default.

Recommended style:

- Background: near black, not pure black
- Panels: dark grey
- Primary accent: accessible blue or green
- Warning/error: high contrast amber/red
- Text: off-white
- Secondary text: light grey

Avoid low-contrast grey text, tiny text, and colour-only status indicators.

## Extra features worth adding

### Revision dashboard

- Recently downloaded papers
- Papers waiting to be marked
- Latest scores
- Weakest topics
- Upcoming exam dates
- Recommended next paper

### Paper packs

Users can download a bundle, for example:

- AQA GCSE Maths Higher Paper 1 from the last 5 years
- Edexcel A level Biology Paper 2 practice pack
- OCR GCSE Computer Science complete set

### Topic tagging

Every question should eventually be tagged by topic, such as:

- Algebra
- Trigonometry
- Atomic structure
- Programming fundamentals
- Shakespeare

This allows targeted practice and smarter feedback.

### Flashcards

Later, missed marks can become flashcards automatically:

- Definition cards
- Formula cards
- Common mistake cards
- Question-specific cards

### Teacher/tutor mode

- Assign papers
- View student submissions
- Compare class performance by topic
- Export marks

## Content and legal considerations

The app should not assume it can freely redistribute every exam-board paper.

Possible approaches:

- Link to official exam-board pages where required
- Store only metadata and user-created converted files where permitted
- Ask exam boards for permission
- Use publicly licensed/specimen materials for the first prototype
- Allow schools or tutors to upload papers they are allowed to use

This needs checking before a public launch.

## Suggested technical architecture

### Frontend

- React or Next.js
- Dark-mode-first design system
- Accessible component library, or carefully built native controls
- Strong keyboard and screen-reader testing

### Backend

- API for paper search, downloads, upload, and marking
- Database for paper metadata, mark schemes, submissions, and results
- File storage for Word documents and uploaded answers
- Background jobs for PDF-to-Word conversion and marking

### Marking service

- Extract text and structure from uploaded `.docx`
- Match answers to question numbers
- Use deterministic rules for objective answers
- Use AI-assisted marking for long answers with clear confidence labels
- Store feedback and marks per question

### Database tables

- `subjects`
- `exam_boards`
- `qualifications`
- `papers`
- `paper_files`
- `mark_schemes`
- `questions`
- `topics`
- `submissions`
- `marks`
- `users`

## MVP build order

1. Build the accessible dark-mode paper search UI.
2. Add sample paper data manually.
3. Add download buttons for question paper and mark scheme `.docx` files.
4. Add upload flow for completed Word documents.
5. Add a basic marking result screen.
6. Add real `.docx` parsing.
7. Add official/source metadata.
8. Add topic feedback and progress tracking.

## Main risks

- Official paper redistribution rights
- PDF-to-Word conversion quality
- Marking accuracy for long written answers
- Matching messy student answers to question numbers
- Accessibility regressions as the UI grows

## Definition of done for prototype

- User can filter papers by subject, exam board, qualification, tier, and paper number.
- User can download a sample question paper as `.docx`.
- User can download the matching mark scheme as `.docx`.
- User can upload a completed `.docx`.
- App shows a marked result page.
- App is usable with keyboard only.
- App has dark mode everywhere.
- Main pages work sensibly with NVDA.
