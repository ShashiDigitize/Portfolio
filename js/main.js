/* ZULF — data rendering and interface logic */
(() => {
  "use strict";

  const JSON_PATH = "data/personal.json";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- data ---------- */

  async function loadData() {
    const res = await fetch(JSON_PATH);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function renderError() {
    const msg = document.createElement("p");
    msg.className = "data-error";
    msg.textContent = "DATA FAULT — could not load data/personal.json. Serve this folder over HTTP and reload.";
    document.querySelector("main").prepend(msg);
    $$("[data-field]").forEach((el) => {
      el.textContent = "—";
    });
  }

  /* ---------- about / studio ---------- */

  function renderAbout(data) {
    const p = data.personal_information;
    const field = (key, value) => {
      const el = $(`[data-field="${key}"]`);
      if (el) el.textContent = value;
    };

    field("name", p.name);
    field("role", p.title);
    field("address", p.address);
    field("languages", data.languages.join(" / "));
    field(
      "certification",
      data.certification
        ? data.certification.name + " — " + data.certification.description
        : "—"
    );
    field(
      "education",
      (data.education || [])
        .map((e) => [e.institution, e.location, e.qualification].filter(Boolean).join(", "))
        .join(" · ")
    );

    const summary = $('[data-field="summary"]');
    if (summary) summary.textContent = data.professional_summary;
  }

  /* ---------- skills / the toolkit ---------- */

  function renderSkills(skills) {
    const bench = $('[data-field="skills"]');
    if (!bench) return;
    bench.innerHTML = "";
    skills.forEach((skill, i) => {
      const row = document.createElement("div");
      row.className = "tool-row reveal";
      row.innerHTML =
        '<span class="tool-idx">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="tool-name">' + skill + "</span>";
      bench.appendChild(row);
    });
  }

  /* ---------- experience / history ---------- */

  function renderExperience(experiences) {
    const log = $('[data-field="experience"]');
    if (!log) return;
    log.innerHTML = "";
    experiences.forEach((exp) => {
      const job = document.createElement("article");
      job.className = "job reveal";
      const period = (exp.period || "").replace(" - ", " — ");
      const company = exp.company
        ? '<p class="job-company">' + exp.company + "</p>"
        : "";
      job.innerHTML =
        '<div class="job-period">' + period + "</div>" +
        '<div class="job-body">' +
        "<h3 class=\"job-role\">" + exp.job_title + "</h3>" +
        company +
        '<ul class="job-duty">' +
        exp.responsibilities.map((r) => "<li>" + r + "</li>").join("") +
        "</ul>" +
        "</div>";
      log.appendChild(job);
    });
  }

  /* ---------- projects / the work ---------- */

  function renderProjects(projects) {
    const list = $('[data-field="projects"]');
    if (!list) return;
    list.innerHTML = "";
    projects.forEach((project, i) => {
      const card = document.createElement("article");
      card.className = "work-card reveal";
      card.innerHTML =
        '<figure class="work-fig">' +
        '<canvas class="work-canvas" aria-hidden="true"></canvas>' +
        "</figure>" +
        '<div class="work-info">' +
        '<div class="work-meta">' + project.type.toUpperCase() + "</div>" +
        "<h3 class=\"work-title\">" + project.title + "</h3>" +
        '<p class="work-desc">' + project.description + "</p>" +
        '<div class="work-tech">' +
        project.tech.map((t) => "<span class=\"chip\">" + t + "</span>").join("") +
        "</div>" +
        project.links
          .map(
            (l) =>
              '<a class="work-link" href="' + l.url + '" target="_blank" rel="noopener">' +
              "View on " + l.name +
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>' +
              "</a>"
          )
          .join("") +
        "</div>";
      list.appendChild(card);
    });
  }

  /* ---------- live projects ---------- */

  function renderLiveProjects(projects) {
    const list = $('[data-field="live_projects"]');
    if (!list) return;
    list.innerHTML = "";
    (projects || []).forEach((project) => {
      const card = document.createElement("article");
      card.className = "live-card reveal";
      card.innerHTML =
        '<div class="live-meta">' +
        (project.platform ? "<span>" + project.platform + "</span>" : "") +
        "<span>" + project.type + "</span>" +
        "</div>" +
        "<h3 class=\"live-title\">" + project.title + "</h3>" +
        '<p class="live-desc">' + project.description + "</p>" +
        (project.technologies && project.technologies.length
          ? '<div class="work-tech">' +
            project.technologies.map((t) => "<span class=\"chip\">" + t + "</span>").join("") +
            "</div>"
          : "") +
        '<a class="live-link" href="' + project.url + '" target="_blank" rel="noopener">' +
        "Open live" +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>' +
        "</a>";
      list.appendChild(card);
    });
  }

  /* ---------- contact ---------- */

  function renderContact(data) {
    const p = data.personal_information;
    const field = (key, value, href) => {
      const el = $(`[data-field="${key}"]`);
      if (el) {
        el.textContent = value;
        el.href = href || value;
      }
    };
    const linkedin = (data.social_media || []).find((s) => /linkedin/i.test(s.platform));
    field("phone", p.phone, "tel:" + p.phone.replace(/[^+\d]/g, ""));
    field("email", p.email, "mailto:" + p.email);
    field("artstation", "ArtStation ↗", p.portfolio && p.portfolio.url);
    const linkedinUrl = linkedin ? linkedin.url : "https://www.linkedin.com/in/zulfekarahmad15/";
    field("linkedin", "LinkedIn ↗", linkedinUrl);
    field("resume", "Resume (PDF)", p.resume);
  }

  /* ---------- scroll reveals ---------- */

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initReveals() {
    const els = $$(".reveal").filter((el) => !el.dataset.revealed);
    els.forEach((el) => (el.dataset.revealed = "1"));
    if (!els.length) return;

    if (window.gsap && window.ScrollTrigger && !REDUCED) {
      gsap.registerPlugin(ScrollTrigger);
      ScrollTrigger.batch(els, {
        start: "top 90%",
        once: true,
        onEnter: (batch) => {
          batch.forEach((el) => {
            el.style.transition = "none";
            el.classList.add("in");
          });
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.6,
            ease: "power2.out",
            stagger: 0.07,
            overwrite: true,
          });
        },
      });
      return;
    }
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    els.forEach((el) => io.observe(el));
  }

  window.zulfReveal = initReveals;

  /* ---------- hero entrance ---------- */

  function initHeroEntrance() {
    if (REDUCED || !window.gsap) return;
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.from(".hero-role", { opacity: 0, y: 12, duration: 0.45 })
      .from(".hero-bio", { opacity: 0, y: 12, duration: 0.45 }, "-=0.25")
      .from(".hero-actions", { opacity: 0, y: 12, duration: 0.45 }, "-=0.25")
      .from(".stage", { opacity: 0, y: 16, duration: 0.7 }, "-=0.5");
  }

  /* ---------- hero scroll ---------- */

  function initHeroScroll() {
    if (REDUCED || !window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    gsap.to(".stage", {
      opacity: 0.35,
      y: -26,
      ease: "none",
      immediateRender: false,
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom top",
        scrub: 0.6,
      },
    });
  }

  /* ---------- per-section effects ---------- */

  function initSectionFX() {
    const rules = $$(".sec-rule");
    if (REDUCED || !window.gsap || !window.ScrollTrigger) {
      rules.forEach((r) => (r.style.transform = "scaleX(1)"));
      return;
    }
    gsap.registerPlugin(ScrollTrigger);

    /* each section title draws its amber rule */
    rules.forEach((rule) => {
      if (rule.dataset.fx) return;
      rule.dataset.fx = "1";
      gsap.fromTo(
        rule,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.55,
          ease: "power3.out",
          scrollTrigger: { trigger: rule, start: "top 92%", once: true },
        }
      );
    });

    /* about: photo in from the left, copy from the right */
    const about = $(".about-grid");
    if (about && !about.dataset.fx) {
      about.dataset.fx = "1";
      gsap.fromTo(
        ".portrait",
        { x: -26, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.7,
          ease: "power2.out",
          scrollTrigger: { trigger: about, start: "top 85%", once: true },
        }
      );
      gsap.fromTo(
        ".about-copy",
        { x: 26, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.7,
          ease: "power2.out",
          scrollTrigger: { trigger: about, start: "top 85%", once: true },
        }
      );
    }

    /* experience: period labels slide in from the left */
    const exp = $(".exp-list");
    if (exp && !exp.dataset.fx) {
      exp.dataset.fx = "1";
      gsap.fromTo(
        ".job-period",
        { x: -14 },
        {
          x: 0,
          duration: 0.5,
          ease: "power2.out",
          stagger: 0.08,
          scrollTrigger: { trigger: exp, start: "top 85%", once: true },
        }
      );
    }
  }

  /* ---------- text reveals ---------- */

  function splitForReveal(el) {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    const frag = document.createDocumentFragment();
    words.forEach((word, i) => {
      const mask = document.createElement("span");
      mask.className = "mask";
      const inner = document.createElement("span");
      inner.className = "mask-inner";
      inner.textContent = word;
      mask.appendChild(inner);
      frag.appendChild(mask);
      if (i < words.length - 1) frag.appendChild(document.createTextNode(" "));
    });
    el.appendChild(frag);
  }

  function initTextReveals() {
    if (REDUCED || !window.gsap) return;
    gsap.registerPlugin(ScrollTrigger);

    /* hero name loads with words rising up */
    const heroTitle = $(".hero-title");
    if (heroTitle && !heroTitle.dataset.split) {
      heroTitle.dataset.split = "1";
      splitForReveal(heroTitle);
      gsap.fromTo(
        heroTitle.querySelectorAll(".mask-inner"),
        { yPercent: 110 },
        { yPercent: 0, duration: 0.85, ease: "power4.out", stagger: 0.05, delay: 0.1 }
      );
    }

    /* section titles reveal the same way on scroll (needs ScrollTrigger) */
    if (!window.ScrollTrigger) return;
    $$(".sec-title").forEach((title) => {
      if (title.dataset.split) return;
      title.dataset.split = "1";
      splitForReveal(title);
      gsap.fromTo(
        title.querySelectorAll(".mask-inner"),
        { yPercent: 110 },
        {
          yPercent: 0,
          duration: 0.7,
          ease: "power4.out",
          stagger: 0.035,
          scrollTrigger: { trigger: title, start: "top 92%", once: true },
        }
      );
    });
  }

  /* ---------- theme ---------- */

  function initTheme() {
    const btn = $("[data-theme-toggle]");
    if (!btn) return;
    const KEY = "zulf-theme";
    const meta = document.querySelector('meta[name="theme-color"]');
    const apply = (theme) => {
      document.documentElement.setAttribute("data-theme", theme);
      btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
      if (meta) meta.setAttribute("content", theme === "dark" ? "#17140f" : "#ece7df");
    };
    apply(document.documentElement.getAttribute("data-theme") || "light");
    btn.addEventListener("click", () => {
      const next =
        document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch (err) {}
    });
  }

  /* ---------- nav state ---------- */

  function initNavState() {
    const links = $$(".nav-links a");
    const map = {};
    links.forEach((a) => {
      map[a.getAttribute("href").slice(1)] = a;
    });
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((a) => a.classList.remove("active"));
          const link = map[entry.target.id];
          if (link) link.classList.add("active");
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    $$("main section").forEach((s) => io.observe(s));
  }

  /* ---------- boot ---------- */

  async function boot() {
    try {
      if (window.initTurntable) window.initTurntable();
    } catch (err) {
      console.error("Turntable failed:", err);
    }
    initReveals();
    initTheme();
    initTextReveals();
    initHeroEntrance();
    initHeroScroll();
    initNavState();
    initSectionFX();

    try {
      const data = await loadData();
      renderAbout(data);
      renderSkills(data.hard_skills);
      renderExperience(data.professional_experience);
      renderProjects(data.projects);
      renderLiveProjects(data.live_projects);
      renderContact(data);
      initReveals();
      initSectionFX();
      if (window.initStudies) window.initStudies();
    } catch (err) {
      console.error("Failed to load portfolio data:", err);
      renderError();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
