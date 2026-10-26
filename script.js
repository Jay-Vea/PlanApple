const carousel = document.getElementById("eventCarousel");
const emptyState = document.getElementById("emptyState");
const mainContent = document.querySelector(".main-content");

const noButtons = document.querySelectorAll(".no-button");
const yesButtons = document.querySelectorAll(".yes-button");
const addButtons = document.querySelectorAll(".add-event");

const sampleEvents = [
  {
    id: "picnic",
    title: "Picnic in the Park",
    image: "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Golden sunlight over a lush landscape",
    month: "APR",
    day: "26",
    location: "Ala Moana Beach Park",
    time: "5:00 PM",
    attendees: 12
  },
  {
    id: "movie-night",
    title: "Movie Night",
    image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Warm lights at an evening gathering",
    month: "MAY",
    day: "03",
    location: "Kakaʻako",
    time: "7:30 PM",
    attendees: 8
  },
  {
    id: "hiking",
    title: "Hiking Adventure",
    image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Mountain peaks surrounded by green scenery",
    month: "MAY",
    day: "11",
    location: "Mānoa Falls",
    time: "9:00 AM",
    attendees: 6
  }
];

let events = [...sampleEvents];

let cards = [];

let isDragging = false;
let isAnimating = false;
let gestureDirection = null;
let activePointerId = null;

let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;

const ANIMATION_TIME = 400;
const SWIPE_DISTANCE = 65;
const DIRECTION_THRESHOLD = 10;

const DECISION_STORAGE_KEY = "planapple-event-decisions";

function loadDecisions() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(DECISION_STORAGE_KEY) || "{}"
    );

    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved
      : {};
  } catch (error) {
    return {};
  }
}

let decisions = loadDecisions();

function saveDecisions() {
  try {
    localStorage.setItem(
      DECISION_STORAGE_KEY,
      JSON.stringify(decisions)
    );
  } catch (error) {
    console.warn("PlanApple couldn't save decisions in this browser.", error);
  }
}

function getEventsByDecision(status) {
  return events.filter(event => decisions[event.id] === status);
}

function createEventCard(event) {
  const card = document.createElement("article");

  card.className = "event-card";
  card.dataset.eventId = event.id;

  const photo = document.createElement("img");

  photo.className = "event-photo";
  photo.src = event.image;
  photo.alt = event.imageAlt || event.title;
  photo.draggable = false;

  const dateBadge = document.createElement("div");
  dateBadge.className = "date-badge";

  const month = document.createElement("span");
  month.textContent = event.month || "";

  const day = document.createElement("strong");
  day.textContent = event.day || "";

  dateBadge.append(month, day);

  const info = document.createElement("div");
  info.className = "event-info";

  const title = document.createElement("h2");
  title.textContent = event.title;

  const location = document.createElement("p");
  location.className = "event-location";

  const locationIcon = document.createElement("i");
  locationIcon.className = "fa-solid fa-location-dot";
  locationIcon.setAttribute("aria-hidden", "true");

  location.append(
    locationIcon,
    document.createTextNode(event.location || "Location TBD")
  );

  const time = document.createElement("p");
  time.className = "event-time";

  const clockIcon = document.createElement("i");
  clockIcon.className = "fa-regular fa-clock";
  clockIcon.setAttribute("aria-hidden", "true");

  const timeText = document.createElement("span");
  timeText.textContent = event.time || "Time TBD";

  time.append(clockIcon, timeText);

  const attendees = document.createElement("p");
  attendees.className = "event-attendees";

  const attendeesIcon = document.createElement("i");
  attendeesIcon.className = "fa-solid fa-user-group";
  attendeesIcon.setAttribute("aria-hidden", "true");

  attendees.append(
    attendeesIcon,
    document.createTextNode(`${event.attendees ?? 0} going`)
  );

  info.append(title, location, time, attendees);
  card.append(photo, dateBadge, info);

  return card;
}

function renderEvents() {
  const availableEvents = events.filter(
    event => !decisions[event.id]
  );

  carousel.replaceChildren();

  availableEvents.forEach(event => {
    carousel.appendChild(createEventCard(event));
  });

  cards = Array.from(carousel.querySelectorAll(".event-card"));

  updateCards();
  updateEmptyState();
}

function updateCards() {
  cards.forEach((card, index) => {
    card.classList.remove("center", "left", "right");

    if (index === 0) {
      card.classList.add("center");
    } else if (index === 1) {
      card.classList.add("right");
    } else if (index === cards.length - 1) {
      card.classList.add("left");
    }
  });
}

function updateEmptyState() {
  const isEmpty = cards.length === 0;

  emptyState.hidden = !isEmpty;
  carousel.hidden = isEmpty;

  if (mainContent) {
    mainContent.classList.toggle("is-empty", isEmpty);
  }

  [...noButtons, ...yesButtons].forEach(button => {
    button.disabled = isEmpty;
  });
}

function resetCardStyles() {
  cards.forEach(card => {
    card.style.transition = "";
    card.style.transform = "";
    card.style.opacity = "";
  });
}

async function makeDecision(decision) {
  if (isAnimating || cards.length === 0) return;

  const currentCard = cards[0];
  const eventId = currentCard.dataset.eventId;

  isAnimating = true;

  try {
    const { data: { user }, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError) throw userError;
    if (!user) throw new Error("Please sign in first.");

    const status = decision === "yes" ? "going" : "declined";

    const { data: membership, error: lookupError } =
      await supabaseClient
        .from("event_members")
        .select("event_id")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (lookupError) throw lookupError;
    if (!membership) {
      throw new Error("You don't have an invitation to this event.");
    }

    const { error: updateError } = await supabaseClient
      .from("event_members")
      .update({ status })
      .eq("event_id", eventId)
      .eq("user_id", user.id);

    if (updateError) throw updateError;

    decisions[eventId] =
      decision === "yes" ? "attending" : "not_attending";
    saveDecisions();

currentCard.style.transition =
  `transform ${ANIMATION_TIME}ms ease, opacity ${ANIMATION_TIME}ms ease`;
    currentCard.style.transform =
      decision === "yes"
        ? "translateX(120vw) rotate(18deg)"
        : "translateX(-120vw) rotate(-18deg)";
    currentCard.style.opacity = "0";

    setTimeout(() => {
      currentCard.remove();
      cards = Array.from(carousel.querySelectorAll(".event-card"));
      updateCards();
      resetCardStyles();
      updateEmptyState();
      renderCalendar();
      isAnimating = false;
    }, ANIMATION_TIME);

  } catch (error) {
    console.error("Couldn't save event response:", error);
    alert(error.message || "Couldn't save your response.");
    isAnimating = false;
    resetCardStyles();
  }
}

noButtons.forEach(button => {
  button.addEventListener("click", event => {
    event.stopPropagation();
    makeDecision("no");
  });
});

yesButtons.forEach(button => {
  button.addEventListener("click", event => {
    event.stopPropagation();
    makeDecision("yes");
  });
});

addButtons.forEach(button => {
  button.addEventListener("click", event => {
    event.stopPropagation();

    document.dispatchEvent(
      new CustomEvent("planapple:add-event-request")
    );
  });
});

function addEvent(event) {
  if (!event || !event.id || !event.title) {
    console.error("PlanApple needs an event ID and title.");
    return;
  }

  if (events.some(existing => existing.id === event.id)) {
    console.error("An event with this ID already exists.");
    return;
  }

  events.push({
    imageAlt: event.title,
    attendees: 0,
    ...event
  });

  renderEvents();
}

function navigateEvent() {
  if (isAnimating || cards.length < 2) return;

  isAnimating = true;

  const outgoingCard = cards[0];
  const incomingCard = cards[1];

  resetCardStyles();

  incomingCard.style.transition = "none";
  incomingCard.style.transform = "translate(220px, 12px) scale(0.86)";
  incomingCard.style.opacity = "0.65";

  incomingCard.getBoundingClientRect();

outgoingCard.style.transition =
  `transform ${ANIMATION_TIME}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${ANIMATION_TIME}ms ease`;

incomingCard.style.transition =
  `transform ${ANIMATION_TIME}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${ANIMATION_TIME}ms ease`;

  incomingCard.style.transform = "translate(0, 0) scale(1)";
  incomingCard.style.opacity = "1";

  setTimeout(() => {
    cards.push(cards.shift());

    updateCards();
    resetCardStyles();

    isAnimating = false;
  }, ANIMATION_TIME);
}

carousel.addEventListener("pointerdown", event => {
  if (isAnimating || isDragging || cards.length === 0) return;

  const card = event.target.closest(".event-card.center");

  if (!card || !carousel.contains(card)) return;
  if (event.target.closest("button")) return;

  isDragging = true;
  activePointerId = event.pointerId;
  gestureDirection = null;

  startX = currentX = event.clientX;
  startY = currentY = event.clientY;

  try {
    card.setPointerCapture(event.pointerId);
  } catch (error) {
  }

  card.style.transition = "none";
});

carousel.addEventListener("pointermove", event => {
  if (!isDragging || event.pointerId !== activePointerId) return;

  currentX = event.clientX;
  currentY = event.clientY;

  const moveX = currentX - startX;
  const moveY = currentY - startY;

  if (!gestureDirection) {
    if (
      Math.abs(moveX) < DIRECTION_THRESHOLD &&
      Math.abs(moveY) < DIRECTION_THRESHOLD
    ) {
      return;
    }

    gestureDirection =
      Math.abs(moveX) > Math.abs(moveY)
        ? "horizontal"
        : "vertical";
  }

  const activeCard = cards[0];
  if (!activeCard) return;

  if (gestureDirection === "horizontal") {
    const rotation = Math.max(-12, Math.min(12, moveX / 18));

activeCard.style.transform =
  `translateX(${moveX}px) rotate(${rotation}deg)`;

    activeCard.style.opacity = String(
      Math.max(0.35, 1 - Math.abs(moveX) / 500)
    );
  } else {
    activeCard.style.transform =
      `translateY(${moveY * 0.45}px) scale(${Math.max(
        0.92,
        1 - Math.abs(moveY) / 1800
      )})`;
  }
});

function finishGesture(event) {
  if (!isDragging || event.pointerId !== activePointerId) return;

  currentX = event.clientX;
  currentY = event.clientY;

  const moveX = currentX - startX;
  const moveY = currentY - startY;

  const direction = gestureDirection;
  const pointerId = activePointerId;
  const activeCard = cards[0];

  isDragging = false;
  activePointerId = null;
  gestureDirection = null;

  if (
    activeCard &&
    activeCard.hasPointerCapture(pointerId)
  ) {
    activeCard.releasePointerCapture(pointerId);
  }

  if (direction === "horizontal") {
    if (moveX <= -SWIPE_DISTANCE) {
      makeDecision("no");
      return;
    }

    if (moveX >= SWIPE_DISTANCE) {
      makeDecision("yes");
      return;
    }
  }

  if (
    direction === "vertical" &&
    Math.abs(moveY) >= SWIPE_DISTANCE
  ) {
    navigateEvent();
    return;
  }

  if (activeCard) {
    activeCard.style.transition = "transform 220ms ease, opacity 220ms ease";
    activeCard.style.transform = "";
    activeCard.style.opacity = "";

    setTimeout(() => {
      if (!isAnimating && activeCard.isConnected) {
        activeCard.style.transition = "";
      }
    }, 240);
  }
}

carousel.addEventListener("pointerup", finishGesture);
carousel.addEventListener("pointercancel", finishGesture);

async function loadEventAttendees(eventIds) {
  if (!eventIds.length) return {};

  const { data: memberships, error } = await supabaseClient
    .from("event_members")
    .select("event_id, user_id")
    .in("event_id", eventIds)
    .eq("status", "going");

  if (error) throw error;
  console.log("Event IDs:", eventIds);
console.log("Attendee memberships:", memberships);

  const memberRows = memberships || [];
  const userIds = [
    ...new Set(memberRows.map(member => member.user_id))
  ];

  let profiles = [];

  if (userIds.length) {
    const { data, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    if (profileError) throw profileError;
    profiles = data || [];
  }

  const profilesById = new Map(
    profiles.map(profile => [
      profile.id,
      profile.display_name || "PlanApple Member"
    ])
  );

  const attendeesByEvent = {};

  memberRows.forEach(member => {
    if (!attendeesByEvent[member.event_id]) {
      attendeesByEvent[member.event_id] = [];
    }

    attendeesByEvent[member.event_id].push({
      userId: member.user_id,
      displayName:
        profilesById.get(member.user_id) || "PlanApple Member"
    });
  });

  return attendeesByEvent;
}

  async function loadEvents() {
    const carousel = document.getElementById("eventCarousel");

    if (carousel) carousel.setAttribute("aria-busy", "true");

    try {
      const { data: { user }, error: userError } =
        await supabaseClient.auth.getUser();

      if (userError) throw userError;

      if (!user) {
        events = [];
        decisions = {};
        renderEvents();
        renderCalendar();
        renderSavedEvents();
        await renderOwnedEventEditorList();
        return;
      }

      const { data: memberships, error: membershipError } =
        await supabaseClient
          .from("event_members")
          .select("event_id, status")
          .eq("user_id", user.id);

      if (membershipError) throw membershipError;

      const { data: createdEvents, error: createdError } =
        await supabaseClient
          .from("events")
          .select("id, title, description, location, starts_at, created_by, visibility")
          .eq("created_by", user.id)
          .order("starts_at", { ascending: true, nullsFirst: false });

      if (createdError) throw createdError;

      const memberEventIds = (memberships || []).map(m => m.event_id);
      let invitedEvents = [];

      if (memberEventIds.length) {
        const { data, error } = await supabaseClient
          .from("events")
          .select("id, title, description, location, starts_at, created_by, visibility")
          .in("id", memberEventIds);

        if (error) throw error;
        invitedEvents = data || [];
      }

      const allEvents = [
        ...(createdEvents || []),
        ...invitedEvents
      ];

      const uniqueEvents = [
        ...new Map(allEvents.map(event => [event.id, event])).values()
      ];

      const attendeesByEvent = await loadEventAttendees(
  uniqueEvents.map(event => event.id)

);
      console.log("Attendees by event:", attendeesByEvent);
console.log("Loaded events:", events);
      decisions = {};

      (memberships || []).forEach(membership => {
        if (membership.status === "going") {
          decisions[membership.event_id] = "attending";
        } else if (membership.status === "declined") {
          decisions[membership.event_id] = "not_attending";
        }
      });

      saveDecisions();

      events = uniqueEvents.map(savedEvent => {
        const startDate = savedEvent.starts_at
          ? new Date(savedEvent.starts_at)
          : null;

        const validDate =
          startDate && !Number.isNaN(startDate.getTime());

        return {
          id: savedEvent.id,
          title: savedEvent.title,
          location: savedEvent.location || "Location not specified",
          description: savedEvent.description || "",
          image: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1000&q=80",
          imageAlt: "People gathering for an event",
          month: validDate
            ? startDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase()
            : "",
          day: validDate
            ? startDate.toLocaleDateString("en-US", { day: "2-digit" })
            : "",
          time: validDate
            ? startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
            : "Time not set",
attendees: (attendeesByEvent[savedEvent.id] || []).length,
attendeeList: attendeesByEvent[savedEvent.id] || [],
          startsAt: savedEvent.starts_at,
          createdBy: savedEvent.created_by,
          visibility: savedEvent.visibility
        };
      });

renderEvents();
renderCalendar();
renderSavedEvents();
      await renderOwnedEventEditorList();

    } catch (error) {
      console.error("Could not load PlanApple events:", error);
      alert("Couldn't refresh events. Check the console for details.");
    } finally {
      if (carousel) carousel.removeAttribute("aria-busy");
    }
  }

function createAttendeeTable(event) {
  const attendees = event.attendeeList || [];

  const panel = document.createElement("section");
  panel.className = "saved-attendees";

  const heading = document.createElement("h4");
  heading.className = "saved-attendees-heading";
  heading.innerHTML = `
    <i class="fa-solid fa-user-group" aria-hidden="true"></i>
    Going (${attendees.length})
  `;

  const scrollArea = document.createElement("div");
  scrollArea.className = "saved-attendees-scroll";
  scrollArea.setAttribute("role", "region");
  scrollArea.setAttribute(
    "aria-label",
    `Attendees for ${event.title || "this event"}`
  );
  scrollArea.tabIndex = 0;

  const table = document.createElement("table");
  table.className = "saved-attendees-table";

  const body = document.createElement("tbody");

  if (attendees.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.className = "saved-attendees-empty";
    cell.textContent = "No attendees yet";

    row.appendChild(cell);
    body.appendChild(row);
  } else {
    attendees.forEach(attendee => {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.textContent =
        attendee.displayName || "PlanApple Member";

      row.appendChild(cell);
      body.appendChild(row);
    });
  }

  table.appendChild(body);
  scrollArea.appendChild(table);
  panel.append(heading, scrollArea);

  return panel;
}

function createSavedEventCard(event) {
  const card = document.createElement("article");
  card.className = "saved-event-card";
  card.dataset.eventId = event.id;

  const layout = document.createElement("div");
  layout.className = "saved-event-layout";

  const details = document.createElement("div");
  details.className = "saved-event-details";

  const title = document.createElement("h3");
  title.className = "saved-event-title";
  title.textContent = event.title || "Untitled event";

  const date = document.createElement("p");
  date.className = "saved-event-date";
  date.textContent = event.month && event.day
    ? `${event.month} ${event.day}`
    : "Date not set";

  const location = document.createElement("p");
  location.className = "saved-event-location";
  location.textContent = event.location || "Location TBD";

  const time = document.createElement("p");
  time.className = "saved-event-time";
  time.textContent = event.time || "Time TBD";

  const description = document.createElement("p");
  description.className = "saved-event-description";
  description.textContent = event.description || "";

  details.append(title, date, location, time);

  if (event.description) {
    details.appendChild(description);
  }

  const attendeeTable =
    window.PlanApple.createAttendeeTable(event);

  layout.append(details, attendeeTable);
  card.appendChild(layout);

  return card;
}

function renderSavedEvents() {
  const savedContainer = document.getElementById("Saved");

  if (!savedContainer) {
    console.warn("PlanApple couldn't find the #Saved screen.");
    return;
  }

const list =
  savedContainer.querySelector(
    "#savedEventsList, .saved-events-list, #calendarEventList"
  );

if (!list) {
  console.warn(
    "Could not find the saved events list inside the Saved screen."
  );
  return;
}

  const savedEvents = getEventsByDecision("attending");
  list.replaceChildren();

  if (savedEvents.length === 0) {
    const empty = document.createElement("p");
    empty.className = "saved-events-empty";
    empty.textContent = "You haven't saved any events yet.";
    list.appendChild(empty);
    return;
  }

  savedEvents.forEach(event => {
    list.appendChild(createSavedEventCard(event));
  });
}

window.PlanApple = {
  addEvent,
  renderEvents,
  loadEvents,
  getEventsByDecision,
  createAttendeeTable,
  createSavedEventCard,
  renderSavedEvents
};

function showScreen(screenId) {
  const screens = ["Main", "Profile", "Saved", "Friends", "Add"];

  screens.forEach(id => {
    const screen = document.getElementById(id);

    if (screen) {
      screen.style.display = id === screenId ? "" : "none";
    }
  });
}

const notificationOverlay =
  document.getElementById("notificationOverlay");

const notificationButton = document.querySelector(
  '[aria-label="Open notifications"]'
);

const closeNotificationsButton =
  document.getElementById("closeNotifications");

const notificationBackdrop =
  document.getElementById("notificationBackdrop");

function openNotifications() {
  notificationOverlay.classList.add("is-open");
}

function closeNotifications() {
  notificationOverlay.classList.remove("is-open");
}

notificationButton.addEventListener("click", openNotifications);

closeNotificationsButton.addEventListener(
  "click",
  closeNotifications
);

notificationBackdrop.addEventListener(
  "click",
  closeNotifications
);

const addEventOverlay =
  document.getElementById("addEventOverlay");

const addEventBackdrop =
  document.getElementById("addEventBackdrop");

const addEventForm =
  document.getElementById("addEventForm");

const addEventModal =
  document.getElementById("addEventModal");

const closeAddEventButton =
  document.getElementById("closeAddEvent");

const cancelAddEventButton =
  document.getElementById("cancelAddEvent");

const newEventName =
  document.getElementById("newEventName");

const newEventTime =
  document.getElementById("newEventTime");

const newEventPlace =
  document.getElementById("newEventPlace");

const newEventInvites =
  document.getElementById("newEventInvites");

let addEventCloseTimeout;

function openAddEventModal() {
  clearTimeout(addEventCloseTimeout);

  addEventOverlay.classList.add("is-open");
  addEventOverlay.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    newEventName.focus();
  });
}

function closeAddEventModal() {
  if (!addEventOverlay.classList.contains("is-open")) return;

  addEventOverlay.classList.remove("is-open");
  addEventOverlay.setAttribute("aria-hidden", "true");

  addEventCloseTimeout = setTimeout(() => {
    document.getElementById("Add_btn").focus();
  }, 280);
}

document.addEventListener(
  "planapple:add-event-request",
  openAddEventModal
);

closeAddEventButton.addEventListener(
  "click",
  closeAddEventModal
);

cancelAddEventButton.addEventListener(
  "click",
  closeAddEventModal
);

addEventBackdrop.addEventListener(
  "click",
  closeAddEventModal
);
// YOUR EXISTING CODE ABOVE
// (Edit Event code, friends code, etc.)

/* =========================================
   PLANAPPLE — ADD EVENT INVITATION OPTIONS
========================================= */


function renderNewEventInviteOptions() {
  const container = document.getElementById("newEventInviteOptions");
  const summary = document.getElementById("newEventInviteSummary");

  if (!container || !summary) return;

  container.replaceChildren();

  function addSectionTitle(text) {
    const heading = document.createElement("p");
    heading.className = "event-invite-section-title";
    heading.textContent = text;
    container.appendChild(heading);
  }

  function addOption({ label, type, id, isGroup = false }) {
    const option = document.createElement("label");
    option.className = "event-invite-option";

    if (isGroup) option.classList.add("is-group");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.inviteType = type;
    checkbox.dataset.inviteId = String(id);

    const name = document.createElement("span");
    name.textContent = label;

    option.append(checkbox, name);
    container.appendChild(option);
  }

  const groups = Array.isArray(wgGroups) ? wgGroups : [];
  const friends = Array.isArray(wgFriends) ? wgFriends : [];

  addSectionTitle("Working Groups");

  if (groups.length) {
    groups.forEach(group => {
      const count = (wgMemberships || []).filter(
        member => String(member.group_id) === String(group.id)
      ).length;

      addOption({
        label: `${group.name} (${count} members)`,
        type: "group",
        id: group.id,
        isGroup: true
      });
    });
  } else {
    const message = document.createElement("p");
    message.className = "event-invite-empty";
    message.textContent = "You haven't created any Working Groups yet.";
    container.appendChild(message);
  }

  addSectionTitle("Friends");

  if (friends.length) {
    friends.forEach(friend => {
      addOption({
        label: wgFriendName(friend),
        type: "friend",
        id: friend.user_id
      });
    });
  } else {
    const message = document.createElement("p");
    message.className = "event-invite-empty";
    message.textContent = "No accepted friends found.";
    container.appendChild(message);
  }

  summary.textContent = "Choose friends or groups";

  container.onchange = () => {
    const count = container.querySelectorAll(
      'input[type="checkbox"]:checked'
    ).length;

    summary.textContent = count
      ? `${count} selected`
      : "Choose friends or groups";
  };
}

const newEventInviteDropdown = document.getElementById(
  "newEventInviteDropdown"
);

if (newEventInviteDropdown) {
  newEventInviteDropdown.addEventListener("toggle", async () => {
    if (!newEventInviteDropdown.open) return;

    try {
      await loadWorkingGroups();
      renderNewEventInviteOptions();
    } catch (error) {
      console.error("Couldn't load friends and groups:", error);
    }
  });
}

// YOUR EXISTING PROFILE CLICK HANDLER
document.querySelector('[aria-label="Open profile"]')
  .addEventListener("click", () => {
    closeNotifications();
    closeAddEventModal();
    showScreen("Profile");
  });

// YOUR EXISTING ESCAPE-KEY HANDLER
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeNotifications();
    closeAddEventModal();
  }
});


addEventForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const nameInput = document.getElementById("newEventName");
  const dateInput = document.getElementById("newEventDate");
  const timeInput = document.getElementById("newEventTime");
  const placeInput = document.getElementById("newEventPlace");

  const title = nameInput.value.trim();
  const date = dateInput.value;
  const time = timeInput.value;
  const location = placeInput.value.trim();

  if (!title || !date || !time || !location) {
    alert("Please fill in the event name, date, time, and place.");
    return;
  }

  const startsAt = new Date(`${date}T${time}`);

  if (Number.isNaN(startsAt.getTime())) {
    alert("Please choose a valid date and time.");
    return;
  }

  const submitButton = addEventForm.querySelector(
    'button[type="submit"]'
  );

  if (submitButton) submitButton.disabled = true;

  try {
    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError) throw userError;

    const user = userData.user;

    if (!user) {
      alert("Please sign in before creating an event.");
      return;
    }

    // Read the selected friends and Working Groups.
    const checkedOptions = document.querySelectorAll(
      "#newEventInviteOptions input[type='checkbox']:checked"
    );

    const selectedFriendIds = new Set();
    const selectedGroupIds = new Set();

    checkedOptions.forEach(checkbox => {
      const id = String(checkbox.dataset.inviteId);

      if (checkbox.dataset.inviteType === "friend") {
        selectedFriendIds.add(id);
      }

      if (checkbox.dataset.inviteType === "group") {
        selectedGroupIds.add(id);
      }
    });

    // Expand selected groups into their members.
    const desiredInviteeIds = new Set(selectedFriendIds);

    (wgMemberships || []).forEach(member => {
      if (selectedGroupIds.has(String(member.group_id))) {
        desiredInviteeIds.add(String(member.member_user_id));
      }
    });

    // Never invite the event creator.
    desiredInviteeIds.delete(String(user.id));

    // Resolve each selected user to an accepted friend's email.
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const friendById = new Map(
      (wgFriends || []).map(friend => [
        String(friend.user_id),
        friend
      ])
    );

    const inviteEmails = [];
    const unresolvedInvitees = [];

    desiredInviteeIds.forEach(id => {
      const friend = friendById.get(id);
      const email = (friend?.email || "").trim().toLowerCase();

      if (!emailPattern.test(email)) {
        unresolvedInvitees.push(id);
      } else {
        inviteEmails.push(email);
      }
    });

    if (unresolvedInvitees.length > 0) {
      throw new Error(
        "Some selected people don't have a usable friend email. " +
        "Please check your friends and Working Groups, then try again."
      );
    }

    const uniqueInviteEmails = [...new Set(inviteEmails)];

    // Create the event using your existing Supabase setup.
    const { data: savedEvent, error: insertError } =
      await supabaseClient
        .from("events")
        .insert({
          title,
          location,
          starts_at: startsAt.toISOString(),
          created_by: user.id,
          visibility: "invite_only"
        })
        .select()
        .single();


if (insertError) throw insertError;


 // Add the event creator as a member.
const { error: ownerMembershipError } = await supabaseClient
  .from("event_members")
  .upsert(
    {
      event_id: savedEvent.id,
      user_id: user.id,
      status: "going"
    },
    {
      onConflict: "event_id,user_id",
      ignoreDuplicates: true
    }
  );


if (ownerMembershipError) {
  console.error(
    "Event created, but adding the creator failed:",
    ownerMembershipError
  );
  throw ownerMembershipError;
}

// Send invitations through your existing server function.
if (uniqueInviteEmails.length > 0) {

      const { error: inviteError } = await supabaseClient.rpc(
        "invite_event_members_by_email",
        {
          p_event_id: savedEvent.id,
          p_emails: uniqueInviteEmails
        }
      );

      if (inviteError) {
        console.error(
          "Event saved, but invitations failed:",
          inviteError
        );

        alert(
          "Your event was saved, but we couldn't process the " +
          "invitations. You can retry invitations later."
        );
      }
    }

    // Keep the event card structure you already use.
    const formattedDate = startsAt.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit"
    });

    const selectedNames = [];

    (wgFriends || []).forEach(friend => {
      if (desiredInviteeIds.has(String(friend.user_id))) {
        selectedNames.push(wgFriendName(friend));
      }
    });

    const newEvent = {
      id: savedEvent.id,
      title: savedEvent.title,
      location: savedEvent.location,
      time: startsAt.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit"
      }),
      month: formattedDate.split(" ")[0].toUpperCase(),
      day: formattedDate.split(" ")[1],
      image:
        "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1000&q=80",
      imageAlt: "People gathering for an outdoor event",
      attendees: 1,
      inviteList: selectedNames,
      startsAt: savedEvent.starts_at,
      createdBy: user.id
    };

    window.PlanApple.addEvent(newEvent);

    closeAddEventModal();
    addEventForm.reset();

    const inviteSummary = document.getElementById(
      "newEventInviteSummary"
    );

    if (inviteSummary) {
      inviteSummary.textContent = "Choose friends or groups";
    }

    const inviteDropdown = document.getElementById(
      "newEventInviteDropdown"
    );

    if (inviteDropdown) inviteDropdown.open = false;

    const inviteOptions = document.getElementById(
      "newEventInviteOptions"
    );

    if (inviteOptions) {
      inviteOptions
        .querySelectorAll('input[type="checkbox"]')
        .forEach(checkbox => {
          checkbox.checked = false;
        });
    }

    alert("Your event has been saved to PlanApple!");

  } catch (error) {
    console.error("Error creating event:", error);

    alert(
      "Couldn't save your event: " +
      (error.message || "Please try again.")
    );
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});


document.querySelector('[aria-label="Open profile"]')
  .addEventListener("click", () => {
    closeNotifications();
    closeAddEventModal();
    showScreen("Profile");
  });

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeNotifications();
    closeAddEventModal();
  }
});

document.getElementById("Event_btn")
  .addEventListener("click", () => showScreen("Main"));

document.getElementById("Saved_btn")
  .addEventListener("click", () => showScreen("Saved"));

document.getElementById("Friends_btn")
  .addEventListener("click", () => showScreen("Friends"));

document.querySelector(".logo")
  .addEventListener("click", event => {
    event.preventDefault();

    closeNotifications();
    closeAddEventModal();

    showScreen("Main");
  });

showScreen("Main");

const SUPABASE_URL = "https://qootuqbtqjnbrgluwojm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Uhoei5TSPz-BnEc_IBxC3g_39YMgS2O";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

console.log("PlanApple connected to Supabase!");

const authScreen = document.getElementById("authScreen");
const authForm = document.getElementById("authForm");
const signInTab = document.getElementById("signInTab");
const signUpTab = document.getElementById("signUpTab");
const displayNameField = document.getElementById("displayNameField");
const displayNameInput = document.getElementById("authDisplayName");
const emailInput = document.getElementById("authEmail");
const passwordInput = document.getElementById("authPassword");
const authMessage = document.getElementById("authMessage");
const authSubmit = document.getElementById("authSubmit");

let authMode = "signin";

function setAuthMode(mode) {
  authMode = mode;

  const creatingAccount = mode === "signup";

  signInTab.classList.toggle("active", !creatingAccount);
  signUpTab.classList.toggle("active", creatingAccount);

  displayNameField.hidden = !creatingAccount;
  displayNameInput.required = creatingAccount;

  passwordInput.autocomplete = creatingAccount
    ? "new-password"
    : "current-password";

  authSubmit.textContent = creatingAccount
    ? "Create Account"
    : "Sign In";

  authMessage.textContent = "";
}

signInTab.addEventListener("click", () => {
  setAuthMode("signin");
});

signUpTab.addEventListener("click", () => {
  setAuthMode("signup");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const displayName = displayNameInput.value.trim();

  if (authMode === "signup" && !displayName) {
    authMessage.textContent = "Please enter your display name.";
    return;
  }

  authSubmit.disabled = true;
  authMessage.textContent = "";

  try {
    if (authMode === "signup") {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        authMessage.textContent = "Account created! Welcome to PlanApple.";
      } else {
        authMessage.textContent =
          "Account created! Check your email to confirm your account, then sign in.";
        setAuthMode("signin");
      }

    } else {
      const { error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      authMessage.textContent = "Signed in successfully!";
    }

  } catch (error) {
    authMessage.textContent =
      error.message || "Something went wrong. Please try again.";
  } finally {
    authSubmit.disabled = false;
  }
});

async function updateAuthScreen() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    authMessage.textContent = error.message;
    return;
  }

  authScreen.hidden = Boolean(data.session);
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  authScreen.hidden = Boolean(session);

  if (session) {
    authMessage.textContent = "";
  }
});

updateAuthScreen();

loadEvents();

async function loadPlanAppleProfile(user) {
  const nameHeading = document.getElementById("profileDisplayName");
  const emailHeading = document.getElementById("profileEmail");
  const nameDetail = document.getElementById("profileNameDetail");
  const emailDetail = document.getElementById("profileEmailDetail");
  const status = document.getElementById("profileStatus");

  if (!user) {
    nameHeading.textContent = "Welcome!";
    emailHeading.textContent = "";
    nameDetail.textContent = "Sign in to view your profile.";
    emailDetail.textContent = "—";
    status.textContent = "";
    return;
  }

  status.textContent = "Loading your profile...";

  let displayName =
    user.user_metadata?.display_name || "PlanApple Member";

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Could not load profile:", error);
    status.textContent =
      "Using your account details. Your profile could not be loaded.";
  } else if (profile?.display_name) {
    displayName = profile.display_name;
    status.textContent = "";
  } else {
    status.textContent =
      "Your account is active, but your profile record wasn't found.";
  }

  nameHeading.textContent = displayName;
  emailHeading.textContent = user.email || "";
  nameDetail.textContent = displayName;
  emailDetail.textContent = user.email || "No email available";
}

async function refreshPlanAppleProfile() {
  const { data, error } = await supabaseClient.auth.getUser();

  if (error) {
    console.error("Could not get current user:", error);
    return;
  }

  await loadPlanAppleProfile(data.user);
}

refreshPlanAppleProfile();

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    setTimeout(() => {
      loadPlanAppleProfile(session.user);
    }, 0);
  }
});

document
  .getElementById("signOutButton")
  .addEventListener("click", async () => {
    const button = document.getElementById("signOutButton");
    const status = document.getElementById("profileStatus");

    button.disabled = true;
    status.textContent = "Signing out...";

    try {
      const { error } = await supabaseClient.auth.signOut();

      if (error) throw error;

      status.textContent = "";
      setAuthMode("signin");
      authForm.reset();

      if (typeof showScreen === "function") {
        showScreen("Main");
      }
    } catch (error) {
      status.textContent = error.message || "Couldn't sign out.";
    } finally {
      button.disabled = false;
    }
  });

const editProfileButton =
  document.getElementById("editProfileButton");

const editProfileForm =
  document.getElementById("editProfileForm");

const editDisplayName =
  document.getElementById("editDisplayName");

const editProfileStatus =
  document.getElementById("editProfileStatus");

const saveProfileButton =
  document.getElementById("saveProfileButton");

const cancelProfileEdit =
  document.getElementById("cancelProfileEdit");

const PLANAPPLE_THEME_KEY = "planapple-dark-mode";

function applyPlanAppleTheme(isDark) {
  document.body.classList.toggle("dark-mode", isDark);

  localStorage.setItem(
    PLANAPPLE_THEME_KEY,
    isDark ? "dark" : "light"
  );
}

applyPlanAppleTheme(
  localStorage.getItem(PLANAPPLE_THEME_KEY) === "dark"
);

const themeToggle = document.getElementById("themeToggle");

function updateThemeToggle() {
  const isDark = document.body.classList.contains("dark-mode");

  themeToggle.innerHTML = isDark
    ? '<i class="fa-solid fa-sun" aria-hidden="true"></i><span>Enable Light Mode</span>'
    : '<i class="fa-solid fa-moon" aria-hidden="true"></i><span>Enable Dark Mode</span>';

  themeToggle.setAttribute("aria-pressed", String(isDark));
}

themeToggle.addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark-mode");
  applyPlanAppleTheme(isDark);
  updateThemeToggle();
});

updateThemeToggle();

editProfileButton.addEventListener("click", async () => {
  const { data, error } = await supabaseClient.auth.getUser();

  if (error || !data.user) {
    editProfileStatus.textContent =
      "Please sign in again to edit your profile.";
    editProfileForm.hidden = false;
    return;
  }

  const currentName =
    data.user.user_metadata?.display_name || "";

  editDisplayName.value = currentName;
  editProfileStatus.textContent = "";
  editProfileForm.hidden = false;
  editProfileButton.hidden = true;
  editDisplayName.focus();
});

cancelProfileEdit.addEventListener("click", () => {
  editProfileForm.hidden = true;
  editProfileButton.hidden = false;
  editProfileStatus.textContent = "";
});

editProfileForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const newName = editDisplayName.value.trim();

  if (!newName) {
    editProfileStatus.textContent =
      "Please enter a display name.";
    return;
  }

  saveProfileButton.disabled = true;
  editProfileStatus.textContent = "Saving your changes...";

  try {
    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError) throw userError;

    const user = userData.user;

    if (!user) {
      throw new Error("Please sign in again.");
    }

    const { error: metadataError } =
      await supabaseClient.auth.updateUser({
        data: { display_name: newName }
      });

    if (metadataError) throw metadataError;

    const { data: updatedProfile, error: profileError } =
      await supabaseClient
        .from("profiles")
        .update({ display_name: newName })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();

    if (profileError) throw profileError;

    if (!updatedProfile) {
      editProfileStatus.textContent =
        "Your account name changed, but the profile row wasn't updated. Please check your profile table permissions.";
      await refreshPlanAppleProfile();
      return;
    }

    await refreshPlanAppleProfile();

    editProfileStatus.textContent = "Display name updated!";
    editProfileForm.hidden = true;
    editProfileButton.hidden = false;

  } catch (error) {
    editProfileStatus.textContent =
      error.message || "Couldn't save your changes.";
  } finally {
    saveProfileButton.disabled = false;
  }
});

const HIDDEN_NOTIFICATIONS_TABLE = "hidden_notifications";

function makeNotificationMessage(text, className = "") {
  const element = document.createElement("p");
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function formatNotificationDate(value) {
  if (!value) return "Event time not set";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Event time not available"
    : date.toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short"
      });
}

async function loadNotifications() {
  const list = document.getElementById("notificationList");
  if (!list) return;

  list.replaceChildren(
    makeNotificationMessage(
      "Checking your notifications...",
      "notification-empty"
    )
  );

  try {
    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError) throw userError;

    const user = userData.user;

    if (!user) {
      list.replaceChildren(
        makeNotificationMessage(
          "Sign in to view your notifications.",
          "notification-empty"
        )
      );
      return;
    }

    const { data: hiddenRows, error: hiddenError } =
      await supabaseClient
        .from(HIDDEN_NOTIFICATIONS_TABLE)
        .select("event_id")
        .eq("user_id", user.id);

    if (hiddenError) throw hiddenError;

    const hiddenKeys = new Set(
      (hiddenRows || []).map(row => String(row.event_id))
    );

    
    const { data: eventUpdateRows, error: eventUpdateError } =
      await supabaseClient
        .from("event_update_notifications")
        .select(
          "id, recipient_user_id, actor_user_id, event_id, event_title, message, created_at, is_read"
        )
        .eq("recipient_user_id", user.id)
        .order("created_at", { ascending: false });

    if (eventUpdateError) throw eventUpdateError;

    const { data: memberships, error: membershipError } =
      await supabaseClient
        .from("event_members")
        .select("event_id, status, created_at, is_read")
        .eq("user_id", user.id)
        .in("status", ["invited", "going"])
        .order("created_at", { ascending: false });

    if (membershipError) throw membershipError;

    const invitations = (memberships || []).filter(
      item => item.status === "invited"
    );

    const attending = (memberships || []).filter(
      item => item.status === "going"
    );

    const { data: hostedEvents, error: hostedError } =
      await supabaseClient
        .from("events")
        .select("id, title, location, starts_at, created_by")
        .eq("created_by", user.id)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true });

    if (hostedError) throw hostedError;


    const eventIds = [...new Set([
      ...invitations.map(item => item.event_id),
      ...attending.map(item => item.event_id),
      ...(hostedEvents || []).map(item => item.id),
      ...(eventUpdateRows || []).map(item => item.event_id)
    ])];


    let eventRows = [];

    if (eventIds.length) {
      const { data, error } = await supabaseClient
        .from("events")
        .select("id, title, location, starts_at, created_by")
        .in("id", eventIds);

      if (error) throw error;
      eventRows = data || [];
    }

    const eventsById = new Map(
      eventRows.map(event => [String(event.id), event])
    );

    const creatorIds = [...new Set(
      eventRows.map(event => event.created_by).filter(Boolean)
    )];

    const { data: profiles, error: profilesError } =
      creatorIds.length
        ? await supabaseClient
            .from("profiles")
            .select("id, display_name")
            .in("id", creatorIds)
        : { data: [], error: null };

    if (profilesError) throw profilesError;

    const namesById = new Map(
      (profiles || []).map(profile => [
        String(profile.id),
        profile.display_name || "A PlanApple member"
      ])
    );

    const notifications = [];

    function addCard({
      type,
      key,
      title,
      message,
      detail = "",
      date = "",
      icon = "fa-bell",
      sortDate = 0,
      onOpen = null,
      isRead = false,
      onMarkRead = null
    }) {
      if (hiddenKeys.has(String(key))) return;

      const card = document.createElement("article");
      card.className = "notification-card";
      if (type === "event-update") {
  card.classList.add("notification-event-updated");
}
      card.dataset.notificationType = type;
      card.dataset.notificationKey = String(key);

      if (isRead) card.classList.add("is-read");

      const top = document.createElement("div");
      top.className = "notification-card-top";

      const iconBox = document.createElement("div");
      iconBox.className = "notification-icon";

      const iconElement = document.createElement("i");
      iconElement.className = `fa-solid ${icon}`;
      iconElement.setAttribute("aria-hidden", "true");
      iconBox.appendChild(iconElement);

      const content = document.createElement("div");
      content.className = "notification-card-content";

      const heading = document.createElement("h3");
      heading.textContent = title;

      content.appendChild(heading);
      content.appendChild(makeNotificationMessage(message));

      if (detail) {
        content.appendChild(makeNotificationMessage(detail));
      }

      if (date) {
        content.appendChild(
          makeNotificationMessage(date, "notification-date")
        );
      }

      top.append(iconBox, content);
      card.appendChild(top);

      if (onOpen) {
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.style.cursor = "pointer";

        card.addEventListener("click", onOpen);

        card.addEventListener("keydown", event => {
          if (
            event.target === card &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            onOpen();
          }
        });
      }

      if (onMarkRead) {
        const actions = document.createElement("div");
        actions.className = "notification-actions";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "notification-accept";
        button.textContent = isRead ? "Read ✓" : "Mark as Read";
        button.disabled = isRead;

        button.addEventListener("click", async event => {
          event.stopPropagation();
          if (button.disabled) return;

          button.disabled = true;
          button.textContent = "Marking...";

          try {
            await onMarkRead();
            button.textContent = "Read ✓";
            card.classList.add("is-read");
          } catch (error) {
            console.error("Couldn't mark notification as read:", error);
            button.disabled = false;
            button.textContent = "Mark as Read";

            card.appendChild(
              makeNotificationMessage(
                error.message || "Couldn't mark this as read.",
                "notification-feedback"
              )
            );
          }
        });

        actions.appendChild(button);
        card.appendChild(actions);
      }

      notifications.push({ card, sortDate });
    }

    async function openEvent(event) {
      try {
        const membership = invitations.find(
          item => String(item.event_id) === String(event.id)
        );

        if (membership) {
          const { data: markedRead, error } =
            await supabaseClient.rpc(
              "mark_event_invitation_read",
              { p_event_id: event.id }
            );

          if (error) throw error;

          if (!markedRead) {
            throw new Error("This invitation is no longer pending.");
          }
        }

        const overlay = document.getElementById(
          "notificationOverlay"
        );

        if (overlay) {
          overlay.classList.remove("open");
          overlay.setAttribute("aria-hidden", "true");
        }

        showScreen("Main");

        let index = events.findIndex(
          item => String(item.id) === String(event.id)
        );

        if (index === -1) {
          await loadEvents();

          index = events.findIndex(
            item => String(item.id) === String(event.id)
          );
        }

        if (index !== -1) {
          const [selected] = events.splice(index, 1);
          events.unshift(selected);

          const decisions = loadDecisions();
          delete decisions[event.id];

          localStorage.setItem(
            "planapple-event-decisions",
            JSON.stringify(decisions)
          );

          renderEvents();
        }
      } catch (error) {
        console.error("Couldn't open notification event:", error);

        list.appendChild(
          makeNotificationMessage(
            error.message || "Couldn't open this event.",
            "notification-feedback"
          )
        );
      }
    }

    invitations.forEach(membership => {
      
    (eventUpdateRows || []).forEach(notification => {
      const eventTitle = notification.event_title || "Untitled event";

      addCard({
        type: "event-update",
        key: notification.id,
        title: "EVENT UPDATED",
        message: `"${eventTitle}" has new details.`,
        detail: notification.message ||
          "Check the latest event information.",
        date: `Updated ${new Date(
          notification.created_at
        ).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        })}`,
        icon: "fa-calendar-check",
        sortDate: new Date(notification.created_at).getTime(),
        isRead: notification.is_read,
        onMarkRead: async () => {
          const { data, error } = await supabaseClient
            .from("event_update_notifications")
            .update({ is_read: true })
            .eq("id", notification.id)
            .eq("recipient_user_id", user.id)
            .select("id")
            .maybeSingle();

          if (error) throw error;

          if (!data) {
            throw new Error("Couldn't update this notification.");
          }

          notification.is_read = true;
        }
      });
    });

      const event = eventsById.get(String(membership.event_id));
      if (!event) return;

      addCard({
        type: "event-invitation",
        key: event.id,
        title: event.title || "Event invitation",
        message:
          `${namesById.get(String(event.created_by)) ||
            "A PlanApple member"} invited you to this event.`,
        detail: event.location || "Location not specified",
        date: formatNotificationDate(event.starts_at),
        icon: "fa-calendar-check",
        sortDate: membership.created_at
          ? new Date(membership.created_at).getTime()
          : 0,
        isRead: membership.is_read,
        onOpen: () => openEvent(event),
        onMarkRead: async () => {
          const { data, error } = await supabaseClient.rpc(
            "mark_event_invitation_read",
            { p_event_id: event.id }
          );

          if (error) throw error;
          if (!data) {
            throw new Error("This invitation is no longer pending.");
          }
        }
      });
    });

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    const attendingIds = new Set(
      attending.map(item => String(item.event_id))
    );

    const hostedIds = new Set(
      (hostedEvents || []).map(event => String(event.id))
    );

    eventRows.forEach(event => {
      if (!event.starts_at) return;

      const starts = new Date(event.starts_at).getTime();

      if (
        !Number.isFinite(starts) ||
        starts < now ||
        starts > now + oneDay
      ) {
        return;
      }

      if (
        !attendingIds.has(String(event.id)) &&
        !hostedIds.has(String(event.id))
      ) {
        return;
      }

      addCard({
        type: "event-reminder",
        key: event.id,
        title: `Coming up: ${event.title || "Your event"}`,
        message: "This event starts within the next 24 hours.",
        detail: event.location || "Location not specified",
        date: formatNotificationDate(event.starts_at),
        icon: "fa-clock",
        sortDate: starts,
        onOpen: () => openEvent(event)
      });
    });

    const { data: friendData, error: friendError } =
      await supabaseClient.rpc("get_planapple_friend_data");

    if (friendError) throw friendError;

    (friendData || []).forEach(friend => {
      const displayName =
        friend.display_name || friend.username || "A PlanApple member";

      if (
        friend.status === "pending" &&
        friend.direction === "incoming" &&
        friend.request_id
      ) {
        addCard({
          type: "friend-request",
          key: friend.request_id,
          title: "New friend request",
          message: `${displayName} sent you a friend request.`,
          detail: friend.username ? `@${friend.username}` : "",
          icon: "fa-user-plus",
          sortDate: friend.created_at
            ? new Date(friend.created_at).getTime()
            : 0,
          onOpen: () => {
            const overlay = document.getElementById(
              "notificationOverlay"
            );

            if (overlay) {
              overlay.classList.remove("open");
              overlay.setAttribute("aria-hidden", "true");
            }

            showScreen("Friends");
            if (typeof loadFriendsPage === "function") {
              loadFriendsPage();
            }
          }
        });
      }

      if (friend.status === "accepted" && friend.user_id) {
        addCard({
          type: "new-friend",
          key: friend.user_id,
          title: "You're connected!",
          message: `You and ${displayName} are friends on PlanApple.`,
          detail: friend.username ? `@${friend.username}` : "",
          icon: "fa-user-group",
          sortDate: friend.created_at
            ? new Date(friend.created_at).getTime()
            : 0,
          onOpen: () => {
            const overlay = document.getElementById(
              "notificationOverlay"
            );

            if (overlay) {
              overlay.classList.remove("open");
              overlay.setAttribute("aria-hidden", "true");
            }

            showScreen("Friends");
            if (typeof loadFriendsPage === "function") {
              loadFriendsPage();
            }
          }
        });
      }
    });

    notifications.sort((a, b) => b.sortDate - a.sortDate);

    list.replaceChildren();

    notifications.forEach(item => list.appendChild(item.card));

    if (!notifications.length) {
      list.appendChild(
        makeNotificationMessage(
          "You're all caught up! No notifications right now.",
          "notification-empty"
        )
      );
    }
  } catch (error) {
    console.error("Could not load notifications:", error);

    list.replaceChildren(
      makeNotificationMessage(
        "Couldn't load notifications. Please close the drawer and try again.",
        "notification-empty"
      )
    );
  }
}

const clearNotificationsButton =
  document.getElementById("clearNotifications");

if (clearNotificationsButton) {
  clearNotificationsButton.addEventListener("click", async () => {
    const list = document.getElementById("notificationList");

    clearNotificationsButton.disabled = true;
    const originalText = clearNotificationsButton.textContent;
    clearNotificationsButton.textContent = "Clearing...";

    try {
      const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

      if (userError) throw userError;

      const user = userData.user;
      if (!user) throw new Error("Please sign in first.");

      const keys = [...new Set(
        [...(list?.querySelectorAll(".notification-card") || [])]
          .map(card => card.dataset.notificationKey)
          .filter(Boolean)
      )];

      if (keys.length) {
        const rows = keys.map(key => ({
          user_id: user.id,
          event_id: key
        }));

        const { error } = await supabaseClient
          .from(HIDDEN_NOTIFICATIONS_TABLE)
          .upsert(rows, {
            onConflict: "user_id,event_id",
            ignoreDuplicates: true
          });

        if (error) throw error;
      }

      await loadNotifications();
    } catch (error) {
      console.error("Couldn't clear notifications:", error);

      alert(
        error.message || "Couldn't clear notifications. Please try again."
      );
    } finally {
      clearNotificationsButton.disabled = false;
      clearNotificationsButton.textContent =
        originalText || "Clear Notifications";
    }
  });
}

const planAppleBell = document.querySelector(
  ".app-header .icon-button"
);

if (planAppleBell) {
  planAppleBell.addEventListener("click", loadNotifications);
}

const friendSearchForm = document.getElementById("friendSearchForm");
const friendSearchInput = document.getElementById("friendSearchInput");
const friendSearchResults = document.getElementById("friendSearchResults");
const friendRequestsBody = document.getElementById("friendRequestsBody");
const existingFriendsBody = document.getElementById("existingFriendsBody");
const friendsMessage = document.getElementById("friendsMessage");
const friendsCount = document.getElementById("friendsCount");

const GROUP_SELECTION_KEY = "planapple-group-selections";

function friendElement(tag, className, text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function friendAvatar(profile) {
  const image = document.createElement("img");
  image.className = "friend-avatar";
  image.alt = "";
  image.src = profile.avatar_url || "";
  image.addEventListener("error", () => {
    image.removeAttribute("src");
  });
  return image;
}

function friendPerson(profile) {
  const person = friendElement("div", "friend-person");
  const details = friendElement("div", "");
  const name = friendElement(
    "div",
    "friend-name",
    profile.display_name || profile.username || "PlanApple Member"
  );

  details.appendChild(name);

  if (profile.username) {
details.appendChild(
  friendElement("div", "friend-username", `@${profile.username}`)
);
  }

  person.append(friendAvatar(profile), details);
  return person;
}

function friendEmptyRow(body, columnCount, message) {
  const row = document.createElement("tr");
  const cell = friendElement("td", "friends-empty", message);
  cell.colSpan = columnCount;
  row.appendChild(cell);
  body.replaceChildren(row);
}

function getGroupSelections() {
  try {
    return JSON.parse(localStorage.getItem(GROUP_SELECTION_KEY) || "[]");
  } catch {
    return [];
  }
}

function setGroupSelection(userId, selected) {
  const selections = new Set(getGroupSelections());

  if (selected) selections.add(userId);
  else selections.delete(userId);

  localStorage.setItem(GROUP_SELECTION_KEY, JSON.stringify([...selections]));
}

async function loadFriendsPage() {
  const { data: { user }, error: authError } =
    await supabaseClient.auth.getUser();

  if (authError || !user) {
    friendEmptyRow(friendRequestsBody, 3, "Sign in to view requests.");
    friendEmptyRow(existingFriendsBody, 4, "Sign in to view friends.");
    friendsCount.textContent = "0";
    return;
  }

  friendEmptyRow(friendRequestsBody, 3, "Loading requests...");
  friendEmptyRow(existingFriendsBody, 4, "Loading friends...");

  const { data, error } = await supabaseClient.rpc(
    "get_planapple_friend_data"
  );

  if (error) {
    console.error("Could not load friends:", error);
    friendEmptyRow(friendRequestsBody, 3, "Couldn't load requests.");
    friendEmptyRow(existingFriendsBody, 4, "Couldn't load friends.");
    return;
  }

  const requests = (data || []).filter(item => item.status === "pending");
  const friends = (data || []).filter(item => item.status === "accepted");

  friendRequestsBody.replaceChildren();

  requests.forEach(request => {
    const row = document.createElement("tr");
    const personCell = document.createElement("td");
    const typeCell = friendElement(
      "td",
      "",
      request.direction === "incoming" ? "Incoming" : "Sent by you"
    );
    const actionCell = document.createElement("td");

    personCell.appendChild(friendPerson(request));

    if (request.direction === "incoming") {
      const accept = friendElement("button", "friend-action", "Accept");
      accept.type = "button";
      accept.addEventListener("click", () =>
        respondToFriendRequest(request.request_id, "accepted")
      );

      const decline = friendElement("button", "friend-remove", "Decline");
      decline.type = "button";
      decline.style.marginLeft = "6px";
      decline.addEventListener("click", () =>
        respondToFriendRequest(request.request_id, "declined")
      );

      actionCell.append(accept, decline);
    } else {
      actionCell.appendChild(
        friendElement("span", "friends-message", "Pending")
      );
    }

    row.append(personCell, typeCell, actionCell);
    friendRequestsBody.appendChild(row);
  });

  if (!requests.length) {
    friendEmptyRow(friendRequestsBody, 3, "No friend requests yet.");
  }

  existingFriendsBody.replaceChildren();

friends.forEach(friend => {
  const row = document.createElement("tr");
  const personCell = document.createElement("td");
  const emailCell = friendElement(
    "td",
    "friend-email",
    friend.email || "—"
  );
  const removeCell = document.createElement("td");

  personCell.appendChild(friendPerson(friend));

  const remove = friendElement(
    "button",
    "friend-remove",
    "Remove"
  );

  remove.type = "button";
  remove.addEventListener("click", () => removeFriend(friend.user_id));

  removeCell.appendChild(remove);
  row.append(personCell, emailCell, removeCell);
  existingFriendsBody.appendChild(row);
});

  friendsCount.textContent = String(friends.length);

  if (!friends.length) {
    friendEmptyRow(existingFriendsBody, 4, "Your friends will appear here.");
  }
}

async function searchPlanAppleUsers(searchText) {
  friendSearchResults.replaceChildren();
  friendsMessage.textContent = "";

  if (searchText.trim().length < 2) {
    friendsMessage.textContent = "Enter at least two characters to search.";
    return;
  }

  const { data, error } = await supabaseClient.rpc(
    "search_planapple_users",
    { search_text: searchText.trim() }
  );

  if (error) {
    console.error("User search failed:", error);
    friendsMessage.textContent = "Search failed. Please try again.";
    return;
  }

  if (!data?.length) {
    friendsMessage.textContent = "No matching users found.";
    return;
  }

  data.forEach(profile => {
    const result = friendElement("div", "friend-result");
    result.appendChild(friendPerson(profile));

    const button = friendElement("button", "friend-action", "Add");
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;

      const { error: requestError } = await supabaseClient.rpc(
        "send_friend_request",
        { target_user_id: profile.user_id }
      );

      if (requestError) {
        friendsMessage.textContent =
          requestError.message || "Couldn't send the request.";
        button.disabled = false;
        return;
      }

      friendsMessage.textContent = "Friend request sent!";
      button.textContent = "Sent";
      await loadFriendsPage();
    });

    result.appendChild(button);
    friendSearchResults.appendChild(result);
  });
}

async function respondToFriendRequest(requestId, response) {
  const { error } = await supabaseClient.rpc("respond_friend_request", {
    request_id: requestId,
    response
  });

  if (error) {
    friendsMessage.textContent = error.message || "Couldn't update request.";
    return;
  }

  friendsMessage.textContent =
    response === "accepted" ? "Friend request accepted." : "Request declined.";

  await loadFriendsPage();
}

async function removeFriend(userId) {
  if (!confirm("Remove this person from your friends?")) return;

  const { error } = await supabaseClient.rpc("remove_friend", {
    target_user_id: userId
  });

  if (error) {
    friendsMessage.textContent = error.message || "Couldn't remove friend.";
    return;
  }

  setGroupSelection(userId, false);
  friendsMessage.textContent = "Friend removed.";
  await loadFriendsPage();
}

friendSearchForm.addEventListener("submit", event => {
  event.preventDefault();
  searchPlanAppleUsers(friendSearchInput.value);
});

document.getElementById("Friends_btn").addEventListener(
  "click",
  loadFriendsPage
);

const calendarMonthLabel = document.getElementById("calendarMonthLabel");
const calendarDays = document.getElementById("calendarDays");
const calendarDayPanel = document.getElementById("calendarDayPanel");
const calendarSelectedDate = document.getElementById("calendarSelectedDate");
const calendarEventList = document.getElementById("calendarEventList");

let calendarMonth = new Date();
calendarMonth.setDate(1);

let selectedCalendarDate = null;

function calendarDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderCalendar() {
  if (!calendarDays) return;

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();

  calendarMonthLabel.textContent = calendarMonth.toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" }
  );

  calendarDays.replaceChildren();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const todayKey = calendarDateKey(new Date());

  for (let i = 0; i < totalCells; i++) {
    const date = new Date(year, month, i - firstDay + 1);
    const dateKey = calendarDateKey(date);

    const dayEvents = (events || []).filter(event => {
      if (!event.startsAt) return false;

      const eventDate = new Date(event.startsAt);
      return !Number.isNaN(eventDate.getTime()) &&
        calendarDateKey(eventDate) === dateKey;
    });

    const hasAccepted = dayEvents.some(
      event => decisions[event.id] === "attending"
    );

    const hasDeclined = dayEvents.some(
      event => decisions[event.id] === "not_attending"
    );

    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.textContent = String(date.getDate());
    button.setAttribute("aria-label", date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    }));

    if (date.getMonth() !== month) {
      button.classList.add("outside-month");
    }

    if (dateKey === todayKey) button.classList.add("today");
    if (hasAccepted) button.classList.add("has-accepted");
    else if (hasDeclined) button.classList.add("has-declined");

    if (selectedCalendarDate === dateKey) {
      button.style.outline = "2px solid var(--burgundy)";
    }

    button.addEventListener("click", () => {
      if (date.getMonth() !== calendarMonth.getMonth()) {
        calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        renderCalendar();
      }

      selectedCalendarDate = dateKey;
      renderCalendarDay(date);
      renderCalendar();
    });

    calendarDays.appendChild(button);
  }
}

function renderCalendarDay(date) {
  calendarDayPanel.hidden = false;

  calendarSelectedDate.textContent = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  calendarEventList.replaceChildren();

  const dayEvents = (events || [])
    .filter(event => {
      if (!event.startsAt) return false;

      const eventDate = new Date(event.startsAt);
      return !Number.isNaN(eventDate.getTime()) &&
        calendarDateKey(eventDate) === calendarDateKey(date);
    })
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));

  if (!dayEvents.length) {
    const empty = document.createElement("p");
    empty.textContent = "No events scheduled for this day.";
    calendarEventList.appendChild(empty);
    return;
  }

  dayEvents.forEach(event => {
    const card = document.createElement("article");
    card.className = "calendar-event-card";

    const title = document.createElement("h4");
    title.textContent = event.title || "Untitled event";

    const time = document.createElement("p");
    time.textContent = event.time || "Time not set";

    const location = document.createElement("p");
    location.textContent = event.location || "Location not specified";

card.append(title, time, location);

const attendeeTable = window.PlanApple.createAttendeeTable(event);
card.appendChild(attendeeTable);

    if (event.description) {
      const description = document.createElement("p");
      description.textContent = event.description;
      card.appendChild(description);
    }

    const status = document.createElement("span");
    status.className = "calendar-event-status";

    if (decisions[event.id] === "attending") {
      status.textContent = "Accepted";
      status.classList.add("accepted");
    } else if (decisions[event.id] === "not_attending") {
      status.textContent = "Declined";
      status.classList.add("declined");
    } else {
      status.textContent = "Awaiting response";
    }

    card.appendChild(status);

const rsvpButton = document.createElement("button");
rsvpButton.type = "button";
rsvpButton.className = "calendar-rsvp-button";

function updateRsvpButton() {
  const attending = decisions[event.id] === "attending";
  rsvpButton.textContent = attending
    ? "Change to Declined"
    : "Change to Going";
}

updateRsvpButton();

rsvpButton.addEventListener("click", async () => {
  rsvpButton.disabled = true;

  try {
    const { data: { user }, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError) throw userError;
    if (!user) throw new Error("Please sign in first.");

    const newStatus =
      decisions[event.id] === "attending" ? "declined" : "going";

    const { error } = await supabaseClient
      .from("event_members")
      .update({ status: newStatus })
      .eq("event_id", event.id)
      .eq("user_id", user.id);

    if (error) throw error;

    decisions[event.id] =
      newStatus === "going" ? "attending" : "not_attending";

    saveDecisions();
    renderCalendar();
    renderCalendarDay(date);

  } catch (error) {
    console.error("Couldn't update RSVP:", error);
    alert(error.message || "Couldn't update your response.");
  } finally {
    rsvpButton.disabled = false;
  }
});

card.appendChild(rsvpButton);

    calendarEventList.appendChild(card);
  });
}

document.getElementById("calendarPrev").addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
});

document.getElementById("calendarNext").addEventListener("click", () => {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
});

document.getElementById("calendarCloseDay").addEventListener("click", () => {
  calendarDayPanel.hidden = true;
  selectedCalendarDate = null;
  renderCalendar();
});

document.getElementById("Saved_btn").addEventListener("click", async () => {
  await loadEvents();
  renderCalendar();
});

renderCalendar();

/* ==================================================
   PLANAPPLE — WORKING GROUPS
   Create, search, rename, delete, and manage members
================================================== */

const wgGroupList = document.getElementById("groupList");
const wgSearchForm = document.getElementById("groupSearchForm");
const wgSearchInput = document.getElementById("groupSearchInput");
const wgCreateButton = document.getElementById("createGroupButton");
const wgCreateForm = document.getElementById("createGroupForm");
const wgNameInput = document.getElementById("groupNameInput");
const wgCancelButton = document.getElementById("cancelGroupButton");
const wgMessage = document.getElementById("groupsMessage");

let wgGroups = [];
let wgFriends = [];
let wgMemberships = [];
let wgOpenEditorId = null;
let wgCurrentUserId = null;
let wgLoading = false;

function wgMessageText(message) {
  if (wgMessage) wgMessage.textContent = message;
}

function wgCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function wgButton(label, className, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", action);
  return button;
}

function wgFriendName(friend) {
  return (
    friend.display_name ||
    friend.username ||
    friend.email ||
    "Friend"
  );
}

function wgGetGroupMembers(groupId) {
  const memberIds = wgMemberships
    .filter(member => member.group_id === groupId)
    .map(member => member.member_user_id);

  return memberIds.map(id => {
    const friend = wgFriends.find(item => item.user_id === id);

    return friend
      ? wgFriendName(friend)
      : "Former friend";
  });
}

async function loadWorkingGroups() {
  if (wgLoading) return;
  wgLoading = true;

  try {
    const {
      data: { user },
      error: authError
    } = await supabaseClient.auth.getUser();

    if (authError) throw authError;

    if (!user) {
      wgCurrentUserId = null;
      wgGroups = [];
      wgFriends = [];
      wgMemberships = [];
      wgGroupList.replaceChildren();

      const row = wgGroupList.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 3;
      cell.textContent = "Sign in to view working groups.";

      return;
    }

    wgCurrentUserId = user.id;

    // Load accepted friends.
    const { data: friendData, error: friendError } =
      await supabaseClient.rpc("get_planapple_friend_data");

    if (friendError) throw friendError;

    const uniqueFriends = new Map();

    (friendData || [])
      .filter(friend => friend.status === "accepted")
      .forEach(friend => {
        if (friend.user_id) {
          uniqueFriends.set(friend.user_id, friend);
        }
      });

    wgFriends = Array.from(uniqueFriends.values());

    // Load groups owned by the signed-in user.
    const { data: groups, error: groupsError } =
      await supabaseClient
        .from("working_groups")
        .select("id, owner_id, name, created_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

    if (groupsError) throw groupsError;

    wgGroups = groups || [];
    const groupIds = wgGroups.map(group => group.id);

    // Load memberships for those groups.
    if (groupIds.length) {
      const { data: memberships, error: membersError } =
        await supabaseClient
          .from("working_group_members")
          .select("group_id, member_user_id, added_at")
          .in("group_id", groupIds);

      if (membersError) throw membersError;

      wgMemberships = memberships || [];
    } else {
      wgMemberships = [];
    }

    wgRenderGroups();
  } catch (error) {
    console.error("Working Groups error:", error);
    wgMessageText(
      error.message || "Couldn't load working groups."
    );
  } finally {
    wgLoading = false;
  }
}

function wgRenderGroups() {
  if (!wgGroupList) return;

  wgGroupList.replaceChildren();

  const query = (wgSearchInput?.value || "")
    .trim()
    .toLowerCase();

  const visibleGroups = wgGroups.filter(group =>
    (group.name || "").toLowerCase().includes(query)
  );

  if (!visibleGroups.length) {
    const row = wgGroupList.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 3;
    cell.textContent = query
      ? "No groups match your search."
      : "No working groups yet.";
    return;
  }

  visibleGroups.forEach(group => {
    const row = document.createElement("tr");

    row.appendChild(wgCell(group.name));

// Members dropdown
const memberNames = wgGetGroupMembers(group.id);

const membersCell = document.createElement("td");
const dropdown = document.createElement("details");
dropdown.className = "group-members-dropdown";

const summary = document.createElement("summary");
summary.textContent = memberNames.length
  ? `${memberNames.length} member${memberNames.length === 1 ? "" : "s"}`
  : "No members";

dropdown.appendChild(summary);

const memberList = document.createElement("div");
memberList.className = "group-members-dropdown-list";

if (memberNames.length) {
  memberNames.forEach(name => {
    const member = document.createElement("div");
    member.className = "group-members-dropdown-item";
    member.textContent = name;
    memberList.appendChild(member);
  });
} else {
  const empty = document.createElement("div");
  empty.className = "group-members-dropdown-item group-members-empty";
  empty.textContent = "No members in this group yet.";
  memberList.appendChild(empty);
}

dropdown.appendChild(memberList);
membersCell.appendChild(dropdown);
row.appendChild(membersCell);

    const actions = document.createElement("td");

    actions.append(
      wgButton("Manage Members", "group-action-button", () => {
        wgOpenEditorId =
          wgOpenEditorId === group.id ? null : group.id;
        wgRenderGroups();
      }),
      wgButton("Rename", "group-action-button", () => {
        wgRenameGroup(group);
      }),
      wgButton("Delete", "group-action-button", () => {
        wgDeleteGroup(group);
      })
    );

    row.appendChild(actions);
    wgGroupList.appendChild(row);

    if (wgOpenEditorId === group.id) {
      wgRenderMemberEditor(group);
    }
  });
}

function wgRenderMemberEditor(group) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 3;

  const panel = document.createElement("div");
  panel.className = "group-member-editor";

  const heading = document.createElement("p");
  heading.textContent = `Select friends for "${group.name}"`;
  panel.appendChild(heading);

  if (!wgFriends.length) {
    const empty = document.createElement("p");
    empty.textContent =
      "You need accepted friends before you can add members.";
    panel.appendChild(empty);
  }

  wgFriends.forEach(friend => {
    const label = document.createElement("label");
    label.className = "group-member-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = wgMemberships.some(member =>
      member.group_id === group.id &&
      member.member_user_id === friend.user_id
    );

    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      wgMessageText("");

      try {
        if (checkbox.checked) {
          const { error } = await supabaseClient
            .from("working_group_members")
            .insert({
              group_id: group.id,
              member_user_id: friend.user_id
            });

          if (error) throw error;
        } else {
          const { error } = await supabaseClient
            .from("working_group_members")
            .delete()
            .eq("group_id", group.id)
            .eq("member_user_id", friend.user_id);

          if (error) throw error;
        }

        wgMessageText("Group members updated.");
        await loadWorkingGroups();
      } catch (error) {
        console.error("Member update error:", error);
        wgMessageText(
          error.message || "Couldn't update group members."
        );
        await loadWorkingGroups();
      }
    });

    const name = document.createElement("span");
    name.textContent = wgFriendName(friend);

    label.append(checkbox, name);
    panel.appendChild(label);
  });

  panel.appendChild(
    wgButton("Done", "group-action-button", () => {
      wgOpenEditorId = null;
      wgRenderGroups();
    })
  );

  cell.appendChild(panel);
  row.appendChild(cell);
  wgGroupList.appendChild(row);
}

if (wgCreateButton && wgCreateForm) {
  wgCreateButton.addEventListener("click", () => {
    const opening = wgCreateForm.hidden;
    wgCreateForm.hidden = !opening;
    wgCreateButton.setAttribute(
      "aria-expanded",
      String(opening)
    );

    if (opening) wgNameInput?.focus();
  });
}

if (wgCancelButton && wgCreateForm) {
  wgCancelButton.addEventListener("click", () => {
    wgCreateForm.reset();
    wgCreateForm.hidden = true;
    wgCreateButton?.setAttribute("aria-expanded", "false");
    wgMessageText("");
  });
}

if (wgCreateForm) {
  wgCreateForm.addEventListener("submit", async event => {
    event.preventDefault();

    const name = (wgNameInput?.value || "").trim();

    if (!name) {
      wgMessageText("Enter a group name first.");
      return;
    }

    try {
      const {
        data: { user },
        error: authError
      } = await supabaseClient.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("Please sign in first.");

      const { error } = await supabaseClient
        .from("working_groups")
        .insert({
          owner_id: user.id,
          name
        });

      if (error) throw error;

      wgCreateForm.reset();
      wgCreateForm.hidden = true;
      wgCreateButton?.setAttribute("aria-expanded", "false");
      wgMessageText("Group created successfully.");

      await loadWorkingGroups();
    } catch (error) {
      console.error("Create group error:", error);
      wgMessageText(
        error.message || "Couldn't create the group."
      );
    }
  });
}

async function wgRenameGroup(group) {
  const proposedName = prompt(
    "Enter a new name for this group:",
    group.name
  );

  if (proposedName === null) return;

  const name = proposedName.trim();

  if (!name) {
    wgMessageText("Group name cannot be empty.");
    return;
  }

  if (name.length > 40) {
    wgMessageText("Group names can be up to 40 characters.");
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("working_groups")
      .update({ name })
      .eq("id", group.id)
      .eq("owner_id", wgCurrentUserId);

    if (error) throw error;

    wgMessageText("Group renamed.");
    await loadWorkingGroups();
  } catch (error) {
    console.error("Rename group error:", error);
    wgMessageText(
      error.message || "Couldn't rename the group."
    );
  }
}

async function wgDeleteGroup(group) {
  if (!confirm(`Delete "${group.name}" and its members?`)) {
    return;
  }

  try {
    // Remove memberships first.
    const { error: membersError } = await supabaseClient
      .from("working_group_members")
      .delete()
      .eq("group_id", group.id);

    if (membersError) throw membersError;

    const { error: groupError } = await supabaseClient
      .from("working_groups")
      .delete()
      .eq("id", group.id)
      .eq("owner_id", wgCurrentUserId);

    if (groupError) throw groupError;

    if (wgOpenEditorId === group.id) {
      wgOpenEditorId = null;
    }

    wgMessageText("Group deleted.");
    await loadWorkingGroups();
  } catch (error) {
    console.error("Delete group error:", error);
    wgMessageText(
      error.message || "Couldn't delete the group."
    );
  }
}

if (wgSearchForm) {
  wgSearchForm.addEventListener("submit", event => {
    event.preventDefault();
    wgRenderGroups();
  });
}

if (wgSearchInput) {
  wgSearchInput.addEventListener("input", wgRenderGroups);
}

// Load groups now and refresh after authentication changes.
loadWorkingGroups();


/* =========================================
   PLANAPPLE — EDIT OWNED EVENTS
========================================= */

let editingEventId = null;
let editingEventMembers = [];

const ownedEventsList = document.getElementById("ownedEventsList");
const eventEditOverlay = document.getElementById("eventEditOverlay");
const eventEditForm = document.getElementById("eventEditForm");
const eventEditStatus = document.getElementById("eventEditStatus");

function formatEventDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }

  const pad = number => String(number).padStart(2, "0");

  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

async function renderOwnedEventEditorList() {
  if (!ownedEventsList) return;

  ownedEventsList.replaceChildren();

  try {
    const { data: { user }, error } =
      await supabaseClient.auth.getUser();

    if (error) throw error;

    if (!user) {
      showOwnedEventMessage("Sign in to manage your events.");
      return;
    }

    const ownedEvents = events
      .filter(event => event.createdBy === user.id)
      .sort((a, b) => {
        const dateA = a.startsAt ? new Date(a.startsAt).getTime() : 0;
        const dateB = b.startsAt ? new Date(b.startsAt).getTime() : 0;
        return dateA - dateB;
      });

    if (!ownedEvents.length) {
      showOwnedEventMessage("You haven't created any events yet.");
      return;
    }

    ownedEvents.forEach(event => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "owned-event-bubble";
      button.textContent = event.title || "Untitled event";

      button.addEventListener("click", () => {
        openEventEditor(event.id);
      });

      ownedEventsList.appendChild(button);
    });
  } catch (error) {
    console.error("Couldn't load your editable events:", error);
    showOwnedEventMessage("Couldn't load your events. Please try again.");
  }
}

function showOwnedEventMessage(message) {
  if (!ownedEventsList) return;

  const paragraph = document.createElement("p");
  paragraph.className = "owned-event-empty";
  paragraph.textContent = message;

  ownedEventsList.replaceChildren(paragraph);
}


/* =========================================
   PLANAPPLE — EVENT INVITATION OPTIONS
========================================= */

function renderEventInviteOptions() {
  const container = document.getElementById("editEventInviteOptions");
  const summary = document.getElementById("editEventInviteSummary");

  if (!container || !summary) return;

  container.replaceChildren();

  function updateSummary() {
    const selected = container.querySelectorAll(
      'input[type="checkbox"]:checked'
    ).length;

    summary.textContent = selected
      ? `${selected} selected`
      : "Choose friends or groups";
  }

  function addSectionTitle(text) {
    const heading = document.createElement("p");
    heading.className = "event-invite-section-title";
    heading.textContent = text;
    container.appendChild(heading);
  }

  function addOption({ label, type, id, isGroup = false }) {
    const option = document.createElement("label");
    option.className = "event-invite-option";

    if (isGroup) option.classList.add("is-group");

    const checkbox = document.createElement("input");
checkbox.type = "checkbox";
checkbox.dataset.inviteType = type;
checkbox.dataset.inviteId = String(id);

const existingMember = editingEventMembers.find(
  member => String(member.user_id) === String(id)
);

checkbox.checked = Boolean(existingMember);
checkbox.dataset.wasInvited = checkbox.checked ? "true" : "false";

checkbox.addEventListener("change", updateSummary);

    const name = document.createElement("span");
    name.textContent = label;

    option.append(checkbox, name);
    container.appendChild(option);
  }

  const groups = Array.isArray(wgGroups) ? wgGroups : [];
  const friends = Array.isArray(wgFriends) ? wgFriends : [];

  addSectionTitle("Working Groups");

  if (groups.length) {
    groups.forEach(group => {
      const memberCount = (wgMemberships || []).filter(
        member => member.group_id === group.id
      ).length;

      addOption({
        label: `${group.name} (${memberCount} members)`,
        type: "group",
        id: group.id,
        isGroup: true
      });
    });
  } else {
    const empty = document.createElement("p");
    empty.className = "event-invite-empty";
    empty.textContent = "You haven't created any Working Groups yet.";
    container.appendChild(empty);
  }

  addSectionTitle("Friends");

  if (friends.length) {
    friends.forEach(friend => {
      addOption({
        label: wgFriendName(friend),
        type: "friend",
        id: friend.user_id
      });
    });
  } else {
    const empty = document.createElement("p");
    empty.className = "event-invite-empty";
    empty.textContent = "No accepted friends found.";
    container.appendChild(empty);
  }

  updateSummary();
}



async function openEventEditor(eventId) {
  const { data: { user }, error } =
    await supabaseClient.auth.getUser();

  if (error || !user) {
    alert("Please sign in to edit events.");
    return;
  }

  // Only allow the creator to open the editor.
  const event = events.find(item =>
    item.id === eventId && item.createdBy === user.id
  );

  if (!event) {
    alert("You can only edit events you created.");
    return;
  }

  editingEventId = event.id;
editingEventMembers = [];

const { data: existingMembers, error: membersError } =
  await supabaseClient
    .from("event_members")
    .select("event_id, user_id, role, status")
    .eq("event_id", event.id);

if (membersError) {
  console.error("Couldn't load existing event members:", membersError);
  alert("Couldn't load the event's invite list. Please try again.");
  return;
}

editingEventMembers = existingMembers || [];
  
  const dateTime = formatEventDateTime(event.startsAt);

  document.getElementById("editEventName").value = event.title || "";
  document.getElementById("editEventDate").value = dateTime.date;
  document.getElementById("editEventTime").value = dateTime.time;
  document.getElementById("editEventPlace").value = event.location || "";

  eventEditStatus.textContent = "";
  eventEditOverlay.hidden = false;

  try {
    await loadWorkingGroups();
    renderEventInviteOptions();
  } catch (loadError) {
    console.error("Couldn't load invitation options:", loadError);

    const container = document.getElementById("editEventInviteOptions");
    if (container) {
      container.replaceChildren();

      const message = document.createElement("p");
      message.className = "event-invite-empty";
      message.textContent = "Couldn't load friends and groups. Please try again.";

      container.appendChild(message);
    }
  }

  document.getElementById("editEventName").focus();
}


function closeEventEditor() {
  eventEditOverlay.hidden = true;
  editingEventId = null;
  eventEditForm.reset();
  eventEditStatus.textContent = "";
}

document.getElementById("closeEventEditor")
  .addEventListener("click", closeEventEditor);

document.getElementById("cancelEventEdit")
  .addEventListener("click", closeEventEditor);

document.getElementById("eventEditBackdrop")
  .addEventListener("click", closeEventEditor);



eventEditForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!editingEventId) return;

  const saveButton = document.getElementById("saveEventEdit");
  saveButton.disabled = true;
  eventEditStatus.textContent = "Saving your changes...";

  try {
    const { data: { user }, error: userError } =
      await supabaseClient.auth.getUser();

    if (userError) throw userError;
    if (!user) throw new Error("Please sign in again.");

    const originalEvent = events.find(item =>
      String(item.id) === String(editingEventId) &&
      item.createdBy === user.id
    );

    if (!originalEvent) {
      throw new Error("You can only edit events you created.");
    }

    const title =
      document.getElementById("editEventName").value.trim();
    const date =
      document.getElementById("editEventDate").value;
    const time =
      document.getElementById("editEventTime").value;
    const location =
      document.getElementById("editEventPlace").value.trim();

    if (!title || !date || !time || !location) {
      throw new Error(
        "Please complete the event name, date, time, and location."
      );
    }



    const startsAt = new Date(`${date}T${time}`);

    if (Number.isNaN(startsAt.getTime())) {
      throw new Error("Please enter a valid date and time.");
    }

    // Read the complete current membership list again before saving.
    const { data: currentMembers, error: membersError } =
      await supabaseClient
        .from("event_members")
        .select("event_id, user_id, role, status")
        .eq("event_id", editingEventId);

    if (membersError) throw membersError;

    const existingMembers = currentMembers || [];

    // Collect the selected friends and groups.
    const checkedOptions = document.querySelectorAll(
      "#editEventInviteOptions input[type='checkbox']:checked"
    );

    const selectedFriendIds = new Set();
    const selectedGroupIds = new Set();

    checkedOptions.forEach(checkbox => {
      const id = String(checkbox.dataset.inviteId);

      if (checkbox.dataset.inviteType === "friend") {
        selectedFriendIds.add(id);
      }

      if (checkbox.dataset.inviteType === "group") {
        selectedGroupIds.add(id);
      }
    });

    // Expand selected groups into their members.
    const desiredInviteeIds = new Set(selectedFriendIds);

    (wgMemberships || []).forEach(member => {
      if (selectedGroupIds.has(String(member.group_id))) {
        desiredInviteeIds.add(String(member.member_user_id));
      }
    });

    // Never invite the event creator.
    desiredInviteeIds.delete(String(user.id));

    // Find existing members who have been deselected.
    // Only remove ordinary members, never the event owner or another role.
    const membersToRemove = existingMembers.filter(member =>
      member.role === "member" &&
      !desiredInviteeIds.has(String(member.user_id))
    );


    // Find new invitees; preserve existing statuses and read flags.
    const existingUserIds = new Set(
      existingMembers.map(member => String(member.user_id))
    );

    const newInviteeIds = new Set(
      [...desiredInviteeIds].filter(id => !existingUserIds.has(id))
    );

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const inviteEmails = [
      ...new Set(
        (wgFriends || [])
          .filter(friend =>
            newInviteeIds.has(String(friend.user_id))
          )
          .map(friend => (friend.email || "").trim().toLowerCase())
          .filter(email => emailPattern.test(email))
      )
    ];

    // Do not silently remove members if the selected invite list
    // cannot be resolved to registered friends.
    const resolvedNewInviteeCount = new Set(
      (wgFriends || [])
        .filter(friend =>
          newInviteeIds.has(String(friend.user_id)) &&
          emailPattern.test((friend.email || "").trim())
        )
        .map(friend => String(friend.user_id))
    ).size;

    if (resolvedNewInviteeCount !== newInviteeIds.size) {
      throw new Error(
        "Some selected people don't have a usable friend email. " +
        "No changes were saved to the event or invitation list."
      );
    }

    // Update the event itself.
    const { data: savedEvent, error: updateError } =
      await supabaseClient
        .from("events")
        .update({
          title,
          location,
          starts_at: startsAt.toISOString()
        })
        .eq("id", editingEventId)
        .eq("created_by", user.id)
        .select(
          "id, title, description, location, starts_at, created_by, visibility"
        )
        .maybeSingle();

    if (updateError) throw updateError;

    if (!savedEvent) {
      throw new Error(
        "The event wasn't updated. Check your permissions and try again."
      );
    }

    // Remove deselected memberships.
    // Each deletion is restricted to this event and this user.
    for (const member of membersToRemove) {
      const { data: removedRows, error: deleteError } =
        await supabaseClient
          .from("event_members")
          .delete()
          .eq("event_id", editingEventId)
          .eq("user_id", member.user_id)
          .eq("role", "member")
          .select("user_id");

      if (deleteError) throw deleteError;

      if (!removedRows || removedRows.length === 0) {
        throw new Error(
          "The event was updated, but a deselected member could not " +
          "be removed. Check your event_members DELETE policy."
        );
      }
    }

// Invite selected registered friends by their user IDs.
if (newInviteeIds.size > 0) {
  const { error: inviteByIdError } = await supabaseClient.rpc(
    "invite_event_members_by_id",
    {
      p_event_id: savedEvent.id,
      p_user_ids: [...newInviteeIds]
    }
  );

  if (inviteByIdError) throw inviteByIdError;
}
    
    // Invite only people who weren't already event members.
    // The server function uses ON CONFLICT DO NOTHING, preserving
    // existing membership statuses.
    if (inviteEmails.length > 0) {
      const { error: inviteError } = await supabaseClient.rpc(
        "invite_event_members_by_email",
        {
          p_event_id: savedEvent.id,
          p_emails: inviteEmails
        }
      );

      if (inviteError) throw inviteError;
    }

    // Update the local event list.
    const updatedDate = new Date(savedEvent.starts_at);

    events = events.map(item => {
      if (String(item.id) !== String(savedEvent.id)) return item;

      return {
        ...item,
        title: savedEvent.title,
        description: savedEvent.description || "",
        location: savedEvent.location || "Location not specified",
        startsAt: savedEvent.starts_at,
        month: updatedDate
          .toLocaleDateString("en-US", { month: "short" })
          .toUpperCase(),
        day: updatedDate
          .toLocaleDateString("en-US", { day: "2-digit" }),
        time: updatedDate
          .toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit"
          })
      };
    });

    // Refresh the saved list and invitation data.
    await loadWorkingGroups();

    const { data: refreshedMembers, error: refreshError } =
      await supabaseClient
        .from("event_members")
        .select("event_id, user_id, role, status")
        .eq("event_id", savedEvent.id);

    if (refreshError) throw refreshError;

    editingEventMembers = refreshedMembers || [];

    renderEvents();
    renderCalendar();
    renderSavedEvents();
    await renderOwnedEventEditorList();

    closeEventEditor();

    alert(`"${savedEvent.title}" was updated successfully!`);
  } catch (error) {
    console.error("Couldn't update event:", error);
    eventEditStatus.textContent =
      error.message || "Couldn't save your changes. Please try again.";
  } finally {
    saveButton.disabled = false;
  }
});



supabaseClient.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    loadWorkingGroups();
  } else if (event === "SIGNED_OUT") {
    wgGroups = [];
    wgFriends = [];
    wgMemberships = [];
    wgCurrentUserId = null;
    wgRenderGroups();
  }
});

/* =========================================
   PLANAPPLE — PERMANENT EVENT DELETION
========================================= */

const deleteEventButton = document.getElementById("deleteEventButton");

deleteEventButton.addEventListener("click", async () => {
  if (!editingEventId) {
    alert("No event is currently selected.");
    return;
  }

  const confirmed = confirm(
    "Permanently delete this event?\n\n" +
    "This action cannot be undone."
  );

  if (!confirmed) return;

  deleteEventButton.disabled = true;
  deleteEventButton.textContent = "Deleting...";

  try {
    const { data: { user }, error: authError } =
      await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Please sign in again before deleting an event.");
    }

    const { data, error } = await supabaseClient
      .from("events")
      .delete()
      .eq("id", editingEventId)
      .eq("created_by", user.id)
      .select("id");

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(
        "Event not deleted. You may not own this event, or database permissions prevented deletion."
      );
    }

    // Close the editor after confirmed deletion.
    document.getElementById("eventEditOverlay").hidden = true;
    document.getElementById("eventEditForm").reset();
    editingEventId = null;

    // Refresh the existing PlanApple views.
    await loadEvents();
    renderEvents();
    renderCalendar();
    renderSavedEvents();
    await renderOwnedEventEditorList();

  } catch (error) {
    console.error("Event deletion failed:", error);
    alert(error.message || "Unable to delete this event.");
  } finally {
    deleteEventButton.disabled = false;
    deleteEventButton.textContent = "Delete Event";
  }
});
