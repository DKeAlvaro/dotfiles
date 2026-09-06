/**
 * Canvas LMS extension — reads Álvaro's canvas.tue.nl session cookie
 * (imported via the `auth canvas` command from his Cookie-Editor export) and
 * exposes tools for courses, assignments, grades, todo, modules, files,
 * pages and announcements.
 *
 * Cookie file: /root/.canvas/cookies.json (chmod 600, [{name,value,domain}])
 * If the session is dead: tell the user to run `auth canvas` in a terminal —
 * paste the fresh Cookie-Editor JSON (no Ctrl-D needed). Done.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const COOKIE_FILE = "/root/.canvas/cookies.json";
const API = "https://canvas.tue.nl/api/v1";
const DL_DIR = "/root/courses/current";

// ---------- helpers ----------

function cookieHeader() {
  try {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf8"));
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch {
    return null;
  }
}

async function canvas(path, { perPage = 100 } = {}) {
  const cookie = cookieHeader();
  if (!cookie) throw new Error("no_cookie");
  const out = [];
  let url = `${API}${path}${path.includes("?") ? "&" : "?"}per_page=${perPage}`;
  while (url) {
    const res = await fetch(url, {
      headers: { Cookie: cookie, Accept: "application/json" },
    });
    if (res.status === 401) throw new Error("session_dead");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`canvas_error ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    if (Array.isArray(data)) out.push(...data);
    else return data;
    const link = res.headers.get("link") || "";
    const m = /<([^>]+)>;\s*rel="next"/.exec(link);
    url = m ? m[1].replace(/^https?:\/\/[^/]+/, "") : null;
  }
  return out;
}

async function courseCode(id) {
  const c = await canvas(`/courses/${id}`);
  const raw = String(c.course_code || "");
  const m = raw.match(/^[A-Za-z0-9]+/);
  return (m && m[0]) || String(id);
}

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" }) : null;

const stripHtml = (html) =>
  html
    ? html
        .replace(/<br ?\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim()
    : "";

// ---------- tools ----------

export default function canvasExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "canvas_session",
    label: "Canvas session",
    description:
      "Check whether the canvas.tue.nl session cookie is valid. Returns ok or session_dead. Call this before any other canvas_* tool to avoid wasted calls.",
    parameters: Type.Object({}),
    async execute() {
      const cookie = cookieHeader();
      if (!cookie) return { content: [{ type: "text", text: "no_cookie" }], details: { status: "no_cookie" } };
      try {
        const me = await canvas("/users/self");
        return {
          content: [{ type: "text", text: `ok — logged in as ${me.name} (${me.email})` }],
          details: { status: "ok", name: me.name, email: me.email },
        };
      } catch (e) {
        const dead = String(e.message).includes("session_dead");
        return {
          content: [
            {
              type: "text",
              text: dead
                ? "session_dead — ask user to run: auth canvas  (paste Cookie-Editor JSON, no Ctrl-D needed)"
                : `error: ${e.message}`,
            },
          ],
          details: { status: dead ? "session_dead" : "error", error: e.message },
        };
      }
    },
  });

  pi.registerTool({
    name: "canvas_courses",
    label: "Canvas courses",
    description: "List Álvaro's active Canvas courses (with id, code, name, term).",
    parameters: Type.Object({}),
    async execute() {
      const courses = await canvas("/courses?enrollment_type=student&state[]=active&include[]=term");
      const rows = courses.map((c) => ({
        id: c.id,
        code: c.course_code,
        name: c.name,
        term: c.term?.name || null,
      }));
      const text = rows.length
        ? rows.map((r) => `${r.id} | ${r.code} | ${r.name}${r.term ? ` (${r.term})` : ""}`).join("\n")
        : "no active courses";
      return { content: [{ type: "text", text }], details: { courses: rows } };
    },
  });

  pi.registerTool({
    name: "canvas_todo",
    label: "Canvas todo",
    description: "What's due for Álvaro right now (upcoming assignments and calendar events with deadlines).",
    parameters: Type.Object({}),
    async execute() {
      const todo = await canvas("/users/self/todo");
      const rows = todo.map((t) => {
        const a = t.assignment || {};
        const ctx = t.context_name || a.course_id || "?";
        return {
          type: t.type,
          course: ctx,
          title: a.name,
          due_at: fmtDate(a.due_at),
          points: a.points_possible,
          id: a.id,
        };
      });
      const text = rows.length
        ? rows.map((r) => `• [${r.type}] ${r.course}: ${r.title} — due ${r.due_at || "?"}`).join("\n")
        : "nothing pending 🎉";
      return { content: [{ type: "text", text }], details: { todo: rows } };
    },
  });

  pi.registerTool({
    name: "canvas_assignments",
    label: "Canvas assignments",
    description: "Assignments for one course (id from canvas_courses). Optionally limit to upcoming.",
    parameters: Type.Object({
      course_id: Type.Number({ description: "Canvas course id" }),
      upcoming_only: Type.Optional(Type.Boolean({ description: "only not-yet-submitted, not-past-due" })),
    }),
    async execute(_id, params) {
      const list = await canvas(
        `/courses/${params.course_id}/assignments?include[]=submission&bucket=all&order_by=due_at`
      );
      let rows = list.map((a) => ({
        id: a.id,
        name: a.name,
        due_at: fmtDate(a.due_at),
        points: a.points_possible,
        submitted: !!(a.submission && a.submission.submitted_at),
        grade: a.submission?.score != null ? `${a.submission.score}/${a.points_possible ?? "?"}` : null,
      }));
      if (params.upcoming_only) {
        const now = Date.now();
        rows = rows.filter((r) => !r.submitted && (!r.due_at || new Date(r.due_at).getTime() > now - 86400000));
      }
      const text = rows.length
        ? rows.map((r) => `${r.submitted ? "✓" : "○"} ${r.name} — due ${r.due_at || "?"}${r.grade ? ` [${r.grade}]` : ""}`).join("\n")
        : "no assignments";
      return { content: [{ type: "text", text }], details: { assignments: rows } };
    },
  });

  pi.registerTool({
    name: "canvas_grades",
    label: "Canvas grades",
    description: "Current grades per course (from enrollments).",
    parameters: Type.Object({}),
    async execute() {
      const enroll = await canvas("/enrollments?user_id=self&type[]=StudentEnrollment&state[]=active&include[]=total_scores");
      const rows = enroll.map((e) => ({
        course_id: e.course_id,
        course: e.course?.name || e.course_id,
        score: e.grades?.current_score,
        grade: e.grades?.current_grade,
        points: e.grades?.final_score,
      }));
      const text = rows.length
        ? rows.map((r) => `${r.course}: ${r.grade ?? "—"} (${r.score != null ? r.score + "%" : "no grade yet"})`).join("\n")
        : "no grade data";
      return { content: [{ type: "text", text }], details: { grades: rows } };
    },
  });

  pi.registerTool({
    name: "canvas_modules",
    label: "Canvas modules",
    description: "Course modules and their items (lectures, files, pages) for one course.",
    parameters: Type.Object({
      course_id: Type.Number({ description: "Canvas course id" }),
    }),
    async execute(_id, params) {
      const mods = await canvas(`/courses/${params.course_id}/modules?include[]=items&include[]=content_details`);
      const rows = mods.map((m) => ({
        module: m.name,
        items: (m.items || []).map((i) => ({ title: i.title, type: i.type, url: i.html_url })),
      }));
      const text = rows.length
        ? rows.map((m) => `## ${m.module}\n${m.items.map((i) => `  • [${i.type}] ${i.title}`).join("\n") || "  (empty)"}`).join("\n")
        : "no modules";
      return { content: [{ type: "text", text }], details: { modules: rows } };
    },
  });

  pi.registerTool({
    name: "canvas_files",
    label: "Canvas files",
    description:
      "Search or list files in a course (lectures, PDFs, resources). Returns file id + name + size. Use canvas_fetch_file to download one.",
    parameters: Type.Object({
      course_id: Type.Number({ description: "Canvas course id" }),
      query: Type.Optional(Type.String({ description: "optional filename search term" })),
      limit: Type.Optional(Type.Number({ description: "max results (default 50)" })),
    }),
    async execute(_id, params) {
      let files = [];
      try {
        if (params.query) {
          try {
            files = await canvas(`/courses/${params.course_id}/search_files?query=${encodeURIComponent(params.query)}`);
          } catch {
            files = [];
          }
        }
        if (!files.length) {
          const all = await canvas(`/courses/${params.course_id}/files?sort=position&order=asc`);
          files = params.query
            ? all.filter((f) => (f.display_name || f.name || "").toLowerCase().includes(params.query.toLowerCase()))
            : all;
        }
      } catch (e) {
        const msg = String(e.message || e);
        if (msg.includes("403")) {
          return {
            content: [{ type: "text", text: "files tab hidden or restricted (403). Not unpublished — use modules / map.md / HPC." }],
            details: { files: [], hidden: true },
          };
        }
        throw e;
      }
      const limit = params.limit || 50;
      const rows = files.slice(0, limit).map((f) => ({
        id: f.id,
        name: f.display_name || f.name,
        size: f.size ? `${(f.size / 1024 / 1024).toFixed(1)}MB` : "?",
        folder: f.folder_id,
      }));
      const text = rows.length
        ? rows.map((r) => `${r.id} | ${r.name} (${r.size})`).join("\n")
        : "no files found";
      return { content: [{ type: "text", text }], details: { files: rows } };
    },
  });

  pi.registerTool({
    name: "canvas_fetch_file",
    label: "Canvas fetch file",
    description:
      "Download a course file (by id from canvas_files) to /root/courses/files/<CODE>/ and return the local path.",
    parameters: Type.Object({
      course_id: Type.Number({ description: "Canvas course id" }),
      file_id: Type.Number({ description: "Canvas file id" }),
    }),
    async execute(_id, params) {
      const cookie = cookieHeader();
      const file = await canvas(`/files/${params.file_id}`);
      const dlUrl = file.url;
      if (!dlUrl) throw new Error("no download url for this file");
      const res = await fetch(dlUrl, { headers: { Cookie: cookie }, redirect: "follow" });
      if (!res.ok) throw new Error(`download failed ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const dir = `${DL_DIR}/${await courseCode(params.course_id)}/files`;
      fs.mkdirSync(dir, { recursive: true });
      const safe = (file.display_name || file.name || `file_${params.file_id}`).replace(/[^\w.\- ]+/g, "_");
      const out = `${dir}/${safe}`;
      fs.writeFileSync(out, buf);
      const text = `downloaded ${buf.length} bytes → ${out}`;
      return { content: [{ type: "text", text }], details: { path: out, bytes: buf.length } };
    },
  });

  pi.registerTool({
    name: "canvas_page",
    label: "Canvas page",
    description:
      "Read a Canvas page's full text (cleaned of HTML). course_id + page_url slug (e.g. from canvas_modules). Omit page_url or pass 'front' for the course front page. The pages index may be disabled per course, but individual pages still work — get slugs from canvas_modules.",
    parameters: Type.Object({
      course_id: Type.Number({ description: "Canvas course id" }),
      page_url: Type.Optional(Type.String({ description: "page url slug; omit or 'front' for the front page" })),
    }),
    async execute(_id, params) {
      const path =
        !params.page_url || params.page_url === "front"
          ? `/courses/${params.course_id}/front_page`
          : `/courses/${params.course_id}/pages/${encodeURIComponent(params.page_url)}`;
      const p = await canvas(path);
      const text = `${p.title}\n\n${stripHtml(p.body)}`.slice(0, 8000);
      return {
        content: [{ type: "text", text }],
        details: { title: p.title, html_url: p.html_url, chars: text.length },
      };
    },
  });

  pi.registerTool({
    name: "canvas_announcements",
    label: "Canvas announcements",
    description:
      "Recent announcements for one course (course_id) or across all active courses (omit course_id). Newest first.",
    parameters: Type.Object({
      course_id: Type.Optional(Type.Number({ description: "Canvas course id; omit for all courses" })),
      limit: Type.Optional(Type.Number({ description: "max announcements (default 10)" })),
    }),
    async execute(_id, params) {
      let codes;
      const names = {};
      if (params.course_id) {
        codes = [`course_${params.course_id}`];
      } else {
        const courses = await canvas("/courses?enrollment_type=student&state[]=active");
        courses.forEach((c) => (names[c.id] = c.course_code || c.name));
        codes = courses.map((c) => `course_${c.id}`);
      }
      const q = codes.map((c) => `context_codes[]=${c}`).join("&");
      const list = await canvas(`/announcements?active_only=true&per_page=50&${q}`);
      const limit = params.limit || 10;
      const rows = list.slice(0, limit).map((a) => ({
        course: names[a.context_code?.replace("course_", "")] || a.context_code,
        title: a.title,
        posted: fmtDate(a.posted_at || a.created_at),
        snippet: stripHtml(a.message).slice(0, 300),
      }));
      const text = rows.length
        ? rows
            .map((r) => `[${r.posted || "?"}] ${r.course}: ${r.title}\n  ${r.snippet.replace(/\n/g, " ")}`)
            .join("\n")
        : "no announcements";
      return { content: [{ type: "text", text }], details: { announcements: rows } };
    },
  });

  // ---------- command: /canvas ----------

  pi.registerCommand("canvas", {
    description: "Canvas: /canvas status (if dead, run 'auth canvas' in a terminal)",
    handler: async (args, ctx) => {
      const arg = (args || "").trim().toLowerCase();
      if (arg === "status" || arg === "") {
        try {
          const cookie = cookieHeader();
          if (!cookie) {
            ctx.ui.notify("No canvas session yet — run: auth canvas", "warning");
            return;
          }
          const res = await fetch(`${API}/users/self`, { headers: { Cookie: cookie } });
          if (res.status === 200) {
            const me = await res.json();
            ctx.ui.notify(`Canvas session OK — ${me.name}`, "info");
          } else {
            ctx.ui.notify("Canvas session DEAD — run: auth canvas", "warning");
          }
        } catch (e) {
          ctx.ui.notify(`Canvas error: ${e.message}`, "warning");
        }
        return;
      }
      ctx.ui.notify("Usage: /canvas status — to (re)auth, run: auth canvas", "warning");
    },
  });
}
