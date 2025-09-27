(function () {
  const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  document.addEventListener("DOMContentLoaded", initExamCalendar);

  function initExamCalendar() {
    const root = document.querySelector("[data-exam-calendar]");
    if (!root) return;

    const monthEl = root.querySelector("[data-calendar-month]");
    const gridEl = root.querySelector("[data-calendar-grid]");
    const eventsEl = root.querySelector("[data-calendar-events]");
    const prevBtn = root.querySelector("[data-calendar-prev]");
    const nextBtn = root.querySelector("[data-calendar-next]");

    if (!monthEl || !gridEl || !eventsEl) return;

    monthEl.setAttribute("aria-live", "polite");

    const today = toDateOnly(new Date());
    const baseMonth = toDateOnly(new Date());
    baseMonth.setDate(1);

    const rawEvents = Array.isArray(window.CLICAED_EXAM_EVENTS)
      ? window.CLICAED_EXAM_EVENTS
      : buildDefaultEvents(today);

    const events = normalizeEvents(rawEvents);
    const eventsByDate = groupEventsByDate(events);

    let viewDate = new Date(baseMonth);

    function render() {
      renderMonthHeader(viewDate, monthEl);
      renderCalendarGrid(viewDate, gridEl, eventsByDate, today);
      renderEventList(viewDate, eventsEl, events);
    }

    prevBtn?.addEventListener("click", function () {
      viewDate.setMonth(viewDate.getMonth() - 1);
      render();
    });

    nextBtn?.addEventListener("click", function () {
      viewDate.setMonth(viewDate.getMonth() + 1);
      render();
    });

    render();
  }

  function renderMonthHeader(date, target) {
    const formatted = date.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    target.textContent = capitalize(formatted);
  }

  function renderCalendarGrid(viewDate, gridEl, eventsByDate, today) {
    gridEl.innerHTML = "";

    DAY_NAMES.forEach(function (name) {
      const head = document.createElement("div");
      head.className = "calendar-cell calendar-cell--head";
      head.textContent = name;
      gridEl.appendChild(head);
    });

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);

    const leadingEmpty = (firstOfMonth.getDay() + 6) % 7; // Monday-first
    const daysInMonth = lastOfMonth.getDate();
    const totalCells = leadingEmpty + daysInMonth;
    const trailingEmpty = (7 - (totalCells % 7)) % 7;
    const cellsCount = totalCells + trailingEmpty;

    for (let idx = 0; idx < cellsCount; idx += 1) {
      const dayNumber = idx - leadingEmpty + 1;
      const currentDate = new Date(year, month, dayNumber);
      const isCurrentMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
      const isoDate = formatDate(currentDate);

      const cell = document.createElement("div");
      cell.className = "calendar-cell";
      cell.textContent = String(currentDate.getDate());
      cell.setAttribute(
        "aria-label",
        currentDate.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      );

      if (!isCurrentMonth) {
        cell.classList.add("calendar-cell--muted");
        cell.dataset.hasEvent = "false";
        cell.setAttribute("aria-hidden", "true");
      } else {
        if (isSameDate(currentDate, today)) {
          cell.classList.add("calendar-cell--today");
        }

        if (eventsByDate.has(isoDate)) {
          const events = eventsByDate.get(isoDate);
          cell.dataset.hasEvent = "true";
          cell.title = events.map(function (evt) {
            return evt.title;
          }).join(" • ");
        } else {
          cell.dataset.hasEvent = "false";
        }
      }

      gridEl.appendChild(cell);
    }
  }

  function renderEventList(viewDate, listEl, events) {
    listEl.innerHTML = "";

    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();

    const monthEvents = events.filter(function (event) {
      return (
        event.dateObj.getFullYear() === year &&
        event.dateObj.getMonth() === month
      );
    });

    if (monthEvents.length === 0) {
      const empty = document.createElement("li");
      empty.className = "calendar-events-empty";
      empty.textContent = "Aucun examen planifié pour ce mois.";
      listEl.appendChild(empty);
      return;
    }

    monthEvents.forEach(function (event) {
      const item = document.createElement("li");
      item.className = "calendar-event-item";

      const timeEl = document.createElement("time");
      timeEl.setAttribute("datetime", event.isoDate);
      timeEl.textContent = capitalize(
        event.dateObj.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      );
      item.appendChild(timeEl);

      const titleSpan = document.createElement("span");
      titleSpan.textContent = event.title;
      item.appendChild(titleSpan);

      const metaBits = [];
      if (event.time) metaBits.push("🕒 " + event.time);
      if (event.location) metaBits.push("📍 " + event.location);
      if (metaBits.length) {
        const meta = document.createElement("span");
        meta.className = "calendar-event-meta";
        meta.textContent = metaBits.join(" · ");
        item.appendChild(meta);
      }

      if (event.description) {
        const desc = document.createElement("span");
        desc.className = "calendar-event-desc";
        desc.textContent = event.description;
        item.appendChild(desc);
      }

      listEl.appendChild(item);
    });
  }

  function normalizeEvents(events) {
    return events
      .map(function (event) {
        const dateObj = parseDate(event.date);
        if (!dateObj) return null;

        return {
          title: event.title || event.subject || "Examen",
          description: event.description || event.details || "",
          location: event.location || event.room || "",
          time: event.time || "",
          dateObj: dateObj,
          isoDate: formatDate(dateObj),
        };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return a.dateObj - b.dateObj;
      });
  }

  function groupEventsByDate(events) {
    const map = new Map();
    events.forEach(function (event) {
      const list = map.get(event.isoDate) || [];
      list.push(event);
      map.set(event.isoDate, list);
    });
    return map;
  }

  function buildDefaultEvents(today) {
    const year = today.getFullYear();
    const month = today.getMonth();

    return [
      {
        date: new Date(year, month, 5),
        title: "Mathématiques - Contrôle continu",
        time: "08:30",
        location: "Salle B204",
      },
      {
        date: new Date(year, month, 12),
        title: "Physique - Travaux pratiques",
        time: "10:00",
        location: "Laboratoire 2",
      },
      {
        date: new Date(year, month, 24),
        title: "Langues - Examen oral",
        time: "09:00",
        location: "Salle A112",
      },
      {
        date: new Date(year, month + 1, 3),
        title: "Sciences sociales - Évaluation finale",
        time: "13:30",
        location: "Salle C301",
      },
    ];
  }

  function parseDate(input) {
    if (input instanceof Date) {
      return toDateOnly(input);
    }

    if (typeof input === "string") {
      const parts = input.split("-");
      if (parts.length === 3) {
        const year = Number(parts[0]);
        const month = Number(parts[1]) - 1;
        const day = Number(parts[2]);
        if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
          return new Date(year, month, day);
        }
      }
      const parsed = new Date(input);
      if (!Number.isNaN(parsed.getTime())) {
        return toDateOnly(parsed);
      }
      return null;
    }

    if (typeof input === "number") {
      const parsed = new Date(input);
      return Number.isNaN(parsed.getTime()) ? null : toDateOnly(parsed);
    }

    return null;
  }

  function toDateOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function isSameDate(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function capitalize(value) {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
})();
