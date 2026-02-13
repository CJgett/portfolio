export default function Bio() {
  return (
    <div className="bio-page">
      <section>
        <h2>Summary</h2>
        <p>
          Software Engineer with experience in full-stack development (React, TypeScript, Next.js/Node.js),
          REST APIs, and relational databases. Proven ability to understand complex codebases and perform
          testing to ensure system reliability. Brings a strong technical foundation in software design principles
          via a Bachelor of Business Information Systems from a leading German university (TU Darmstadt),
          and is comfortable working in a Linux dev environment.
        </p>
      </section>

      <section>
        <h2>Skills</h2>
        <h3>Technical</h3>
        <ul>
          <li><strong>Languages &amp; Frameworks:</strong> JS/HTML/CSS, React, TypeScript, Java, Next.js/Node.js</li>
          <li><strong>Backend:</strong> Java, Node.js</li>
          <li><strong>Databases:</strong> Postgres, MySQL, Relational Database Design</li>
          <li><strong>Tools &amp; Methodologies:</strong> Version Control (Git), Agile/Scrum (Jira), CI/CD (Vercel)</li>
        </ul>
        <h3>Languages</h3>
        <ul>
          <li><strong>English:</strong> native, <strong>German:</strong> fluent, <strong>Korean:</strong> beginner</li>
        </ul>
      </section>

      <section>
        <h2>Education</h2>
        <h3>Bachelor, Business Information Systems | TU Darmstadt</h3>
        <p>Oct 2018 &ndash; Feb 2024 | Technical University of Darmstadt, Germany</p>
        <p>Thesis Project:</p>
        <ul>
          <li>Logistics Algorithm Visualization</li>
          <li>Utilized React</li>
          <li><a href="https://github.com/cjgettinger/tsp-visualization" target="_blank" rel="noopener noreferrer">Visualization of Branch and Bound Algorithms for the Traveling Salesman Problem</a></li>
        </ul>
      </section>

      <section>
        <h2>Professional Experience</h2>

        <h3>Freelance Web Developer</h3>
        <p>Jun 2024 &ndash; Present | Sydney, Australia</p>
        <ul>
          <li>Managed end-to-end delivery of web projects, from requirement gathering to final deployment.</li>
          <li>Translated technical constraints into clear, accessible language for non-technical stakeholders to manage expectations and define project scope.</li>
          <li>Applied best-practice web accessibility standards to ensure inclusive design.</li>
        </ul>

        <h3>Frontend Developer | ECONSOR</h3>
        <p>Apr 2024 &ndash; Jun 2024 | Frankfurt, Germany</p>
        <ul>
          <li>Translated functional requirements into clean, maintainable code, ensuring adherence to strict quality standards (WCAG 2.1 AA).</li>
          <li>Collaborated in an Agile environment to deliver high-quality software features within sprint timelines.</li>
        </ul>

        <h3>Part-time Software Developer | Fraunhofer Institute for Secure Information Technology (SIT)</h3>
        <p>Feb 2023 &ndash; Jun 2023 | Darmstadt, Germany</p>
        <ul>
          <li>Contributed to a complex, commercial Java backend for an application vulnerability scanner.</li>
          <li>Developed targeted Android applications to perform unit and integration tests on scanner components, ensuring code quality and reliability.</li>
        </ul>

        <h3>Part-time Web Developer | TU Darmstadt</h3>
        <p>Dec 2019 &ndash; Apr 2022 | Darmstadt, Germany</p>
        <ul>
          <li>Set up and managed WordPress-based websites, including programming individual custom JS/HTML/CSS elements.</li>
        </ul>
      </section>

      <section>
        <h2>Key Projects</h2>

        <h3><a href="https://gettinger-recipes.com" target="_blank" rel="noopener noreferrer">gettinger-recipes.com</a> | Website</h3>
        <p>Jun 2024 &ndash; Present</p>
        <ul>
          <li>Engineered a full-stack web application using React and Next.js.</li>
          <li>Integrated a third-party system: built a chatbot using the Claude REST API and custom system prompts to allow users to adapt recipes to their needs.</li>
          <li>Implemented user authentication (NextAuth.js) and a Postgres database.</li>
        </ul>

        <h3>Product Owner | TU Darmstadt, Group Project</h3>
        <p>Oct 2020 &ndash; Mar 2021</p>
        <ul>
          <li>Led a team of students to create a mobile app, creating and maintaining a product backlog based on client specifications in Jira.</li>
          <li>Facilitated communication between the client and development team.</li>
        </ul>
      </section>
    </div>
  );
}
