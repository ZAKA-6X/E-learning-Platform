🤖 AI Integration for Teachers

We integrated an AI assistant into the teacher dashboard so teachers can generate helpful resources (summaries, key concepts, quizzes, and exercises) from any file they upload.

Features

✨ AI button beside each resource in the library.

Teachers can choose a mode:

Résumé (summarize PDF/DOCX/text)

Concepts clés (extract bullet points)

QCM (generate multiple-choice quiz in JSON)

Exercices + solutions (generate practice problems with answers)

AI preview shows the result before saving.

Teachers can insert the AI output directly into their course folders as a new resource.

How it works

Teacher uploads a resource (PDF, DOCX, image, video, link, etc.).

Click the ✨ AI button → select desired mode.

Backend fetches and parses the file:

pdf-parse for PDFs

mammoth for Word DOCX

plain text/HTML for links and text files

empty text for images/videos (the model analyzes the URL itself)

The backend sends a request to OpenAI GPT-4o-mini with a tailored prompt.

The generated output is shown in preview.

Teacher can save the result into the chosen section → stored in Supabase Storage and referenced in library_items with kind="other".


----------------- I M P O R T A N T ------------------------
I used AI_MOCK=1 in .env to test before adding adding payment details in https://platform.openai.com/settings/organization/billing/overview
we already have 5$ each month so we can test : https://platform.openai.com/settings/organization/usage
