# School Platform

Project structure and setup for E-learning Platform.

6X: add login page, 
    connect with database, 
    take data from exel file uploaded, 
    separate app.js file (make it cleanner), 
    add and insert users in db from exel file, 
    send email with password for every student in exel file via whatsapp, using TWILO,
    add role in user table,
    create matieres table,
    add matieres id in cours table,
    display matieres in its page (matieres and programmes),
    display number of student in admin dashboard,

    #####Student Part########
    update navbar menu,
    add todo Function,
    add posts create,
    add display posts,
    add comments and vote to posts,
    set posts for teachers users,
    add user profile section,
    add filter sort tools to posts,
    fix audience for stud-posts,
    media reader for posts,
    responsive reader-media,
    ***back to login page,
    error and confirm message of pages,
    posts, comments delete,
    reset sort, filter after creation new post,
    add calender display exams (no database***),
    home page hase list student,
    inbox page (need activate***),
    


todo: toxic comments, posts, formation enseignat,
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
