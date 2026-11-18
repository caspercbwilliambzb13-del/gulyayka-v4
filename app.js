(function () {
  "use strict";

  var STORE_KEY = "gulyayka_store_v4";
  var WALK_DURATIONS = [15, 30, 45, 60, 90];
  var DEFAULTS = {
    version: 4,
    theme: "light",
    role: "client",
    sitterTab: "requests",
    prices: { walk: { 15: 300, 30: 350, 45: 400, 60: 450, 90: 500 }, wash: 150, boarding: 1500 },
    company: { name: "Анна Ветрова", phone: "+7 900 123-45-67", district: "Парк рядом", accent: "#3f899e" },
    cart: [],
    draft: { name: "", phone: "", address: "", dogName: "", breed: "", comment: "", consent: false, subscription: 0, idempotencyKey: "" },
    appointments: [],
    password: "",
    builder: { service: "walk", duration: 45, wash: false, secondDog: false, withOthers: false, photoEvery: false, boardingDays: 1, date: "", time: "09:00" }
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function readStore() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!saved || typeof saved !== "object") return clone(DEFAULTS);
      var state = Object.assign(clone(DEFAULTS), saved);
      state.prices = Object.assign(clone(DEFAULTS.prices), saved.prices || {});
      state.prices.walk = Object.assign(clone(DEFAULTS.prices.walk), (saved.prices || {}).walk || {});
      state.company = Object.assign(clone(DEFAULTS.company), saved.company || {});
      state.draft = Object.assign(clone(DEFAULTS.draft), saved.draft || {});
      state.builder = Object.assign(clone(DEFAULTS.builder), saved.builder || {});
      state.cart = Array.isArray(saved.cart) ? saved.cart : [];
      state.appointments = Array.isArray(saved.appointments) ? saved.appointments : [];
      return state;
    } catch (error) {
      return clone(DEFAULTS);
    }
  }
  var state = readStore();
  var toastTimer;

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    render();
  }
  function money(value) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(value)) + " ₽"; }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }
  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  }
  function dateKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  function parseDate(key) { return new Date(key + "T12:00:00"); }
  function formatDate(key, options) {
    if (!key) return "";
    return new Intl.DateTimeFormat("ru-RU", options || { day: "numeric", month: "long" }).format(parseDate(key));
  }
  function dateLabel(key) {
    var date = parseDate(key);
    var today = new Date();
    if (dateKey(date) === dateKey(today)) return "Сегодня";
    var tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (dateKey(date) === dateKey(tomorrow)) return "Завтра";
    return formatDate(key, { weekday: "short", day: "numeric", month: "short" });
  }
  function dateTimeLocal(key, time) { return key + "T" + (time || "09:00"); }
  function nowTimeIsPast(key, time) {
    var chosen = new Date(dateTimeLocal(key, time));
    return chosen.getTime() < Date.now() + 5 * 60 * 1000;
  }
  function priceFor(item) {
    if (item.service === "boarding") return state.prices.boarding * Number(item.boardingDays || 1);
    var base = Number(state.prices.walk[item.duration] || 0);
    return base + (item.wash ? Number(state.prices.wash) : 0) + (item.secondDog ? base * 0.5 : 0);
  }
  function isWalk(item) { return item.service === "walk"; }
  function statusName(status) {
    return { new: "На согласовании", approved: "Согласована", completed: "Завершена", cancelled: "Отменена" }[status] || "На согласовании";
  }
  function statusClass(status) { return "status-" + (status || "new"); }
  function showToast(message) {
    var toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("is-visible"); }, 2800);
  }
  function setTheme(theme) {
    state.theme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = state.theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = state.theme === "dark" ? "#101c21" : "#eaf6fb";
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }
  function syncRole() {
    var client = state.role !== "sitter";
    document.getElementById("clientView").hidden = !client;
    document.getElementById("sitterView").hidden = client;
    document.getElementById("clientNav").hidden = !client;
    document.getElementById("mobileNav").hidden = !client;
    document.body.classList.toggle("is-sitter", !client);
    var roleButtons = document.querySelectorAll('[data-action="role"]');
    roleButtons.forEach(function (button) {
      button.setAttribute("aria-label", client ? "Открыть кабинет ситтера" : "Вернуться к прогулкам");
    });
  }

  function ensureDialog() {
    var dialog = document.getElementById("checkoutDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "checkoutDialog";
    dialog.className = "checkout-dialog";
    dialog.setAttribute("aria-labelledby", "checkoutTitle");
    dialog.innerHTML = '<form id="checkoutForm" method="dialog" class="checkout-form">' +
      '<div class="dialog-heading"><div><p class="eyebrow">Остался последний шаг</p><h2 id="checkoutTitle">Детали для ситтера</h2><p class="section-desc">Оплата после подтверждения, в приложении денег не списываем.</p></div><button type="button" class="icon-button" data-action="close-checkout" aria-label="Закрыть">×</button></div>' +
      '<div class="settings-form">' +
      '<label class="settings-field">Ваше имя<input name="name" autocomplete="name" required maxlength="80"></label>' +
      '<label class="settings-field">Телефон<input name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="30" placeholder="+7 900 000-00-00"></label>' +
      '<label class="settings-field settings-full">Адрес прогулки<input name="address" autocomplete="street-address" required maxlength="160" placeholder="Улица и дом"></label>' +
      '<label class="settings-field">Имя собаки<input name="dogName" required maxlength="60"></label>' +
      '<label class="settings-field">Порода<input name="breed" required maxlength="80"></label>' +
      '<label class="settings-field settings-full">Комментарий<textarea name="comment" rows="3" maxlength="500" placeholder="Характер, привычки, важные детали"></textarea></label>' +
      '<label class="consent-field settings-full"><input name="consent" type="checkbox" required><span>Согласен(на) на обработку данных для связи по этой заявке.</span></label>' +
      '</div><div class="dialog-total"><span>К оплате после согласования</span><b id="dialogTotal">0 ₽</b></div>' +
      '<div class="dialog-actions"><button type="button" class="button button-secondary" data-action="close-checkout">Вернуться</button><button class="button button-primary" type="submit">Отправить заявку</button></div>' +
      '<p class="form-note">Демо-макет: данные остаются в localStorage этого браузера.</p></form>';
    document.body.appendChild(dialog);
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });
    dialog.querySelectorAll("input, textarea").forEach(function (field) {
      field.addEventListener("input", captureDraft);
      field.addEventListener("change", captureDraft);
    });
    dialog.querySelector("form").addEventListener("submit", submitOrder);
    return dialog;
  }
  function captureDraft() {
    var form = document.getElementById("checkoutForm");
    if (!form) return;
    var data = new FormData(form);
    ["name", "phone", "address", "dogName", "breed", "comment"].forEach(function (key) {
      state.draft[key] = String(data.get(key) || "");
    });
    state.draft.consent = form.elements.consent.checked;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }
  function fillCheckoutDraft() {
    var dialog = ensureDialog();
    var form = dialog.querySelector("form");
    ["name", "phone", "address", "dogName", "breed", "comment"].forEach(function (key) {
      form.elements[key].value = state.draft[key] || "";
    });
    form.elements.consent.checked = Boolean(state.draft.consent);
    document.getElementById("dialogTotal").textContent = money(cartTotal().total);
    dialog.showModal();
    setTimeout(function () { form.elements.name.focus(); }, 30);
  }
  function cartTotal() {
    var subtotal = state.cart.reduce(function (sum, item) { return sum + priceFor(item); }, 0);
    var walks = state.cart.filter(isWalk).length;
    var subscription = walks ? Number(state.draft.subscription || 0) : 0;
    var discountRate = subscription === 10 ? 0.05 : subscription === 20 ? 0.10 : subscription === 30 ? 0.15 : 0;
    var discount = Math.round(state.cart.filter(isWalk).reduce(function (sum, item) { return sum + priceFor(item); }, 0) * discountRate);
    return { subtotal: subtotal, discount: discount, total: Math.max(0, subtotal - discount), walks: walks };
  }

  function renderDates() {
    var now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var html = "";
    for (var index = 0; index < 7; index += 1) {
      var date = new Date(start);
      date.setDate(start.getDate() + index);
      var key = dateKey(date);
      html += '<button type="button" class="date-chip' + (state.builder.date === key ? " is-selected" : "") + '" data-date="' + key + '" aria-pressed="' + (state.builder.date === key) + '">' +
        '<span>' + esc(index === 0 ? "Сегодня" : new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date)) + '</span><b>' +
        date.getDate() + " " + esc(new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(date)) + "</b></button>";
    }
    document.getElementById("dateStrip").innerHTML = html;
  }
  function approvedTimeBusy(key, time) {
    return state.appointments.some(function (request) {
      return request.status === "approved" && (request.items || []).some(function (item) {
        return item.date === key && item.time === time;
      });
    });
  }
  function renderTimes() {
    var html = "";
    for (var minutes = 7 * 60; minutes <= 21 * 60; minutes += 15) {
      var time = String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
      var busy = approvedTimeBusy(state.builder.date, time);
      var past = state.builder.date === dateKey(new Date()) && nowTimeIsPast(state.builder.date, time);
      var disabled = busy || past;
      html += '<button type="button" class="time-chip' + (busy ? " is-busy" : "") + (state.builder.time === time ? " is-selected" : "") + '" data-time="' + time + '" aria-pressed="' + (state.builder.time === time) + '"' + (disabled ? " disabled" : "") + '>' + time + "</button>";
    }
    document.getElementById("timeStrip").innerHTML = html;
    var busySelected = approvedTimeBusy(state.builder.date, state.builder.time);
    var pastSelected = state.builder.date === dateKey(new Date()) && nowTimeIsPast(state.builder.date, state.builder.time);
    var hint = document.getElementById("availabilityHint");
    hint.textContent = busySelected ? "Это время уже занято. Выберите другой слот." : pastSelected ? "Это время уже прошло. Выберите другой слот." : "Часы работы: 9:00–18:00. Раннее и позднее время согласуем отдельно.";
    hint.setAttribute("aria-live", "polite");
  }
  function updateBuilderControls() {
    document.querySelectorAll("[data-service]").forEach(function (button) {
      var selected = button.dataset.service === state.builder.service;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll("[data-duration]").forEach(function (button) {
      var selected = Number(button.dataset.duration) === Number(state.builder.duration);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      var currentPrice = state.prices.walk[button.dataset.duration];
      button.querySelector("span").textContent = money(currentPrice);
    });
    document.getElementById("walkOptions").hidden = state.builder.service !== "walk";
    document.getElementById("boardingOptions").hidden = state.builder.service !== "boarding";
    document.getElementById("washPaws").checked = Boolean(state.builder.wash);
    document.getElementById("secondDog").checked = Boolean(state.builder.secondDog);
    document.getElementById("withOthers").checked = Boolean(state.builder.withOthers);
    document.getElementById("photoEvery").checked = Boolean(state.builder.photoEvery);
    document.getElementById("photoEveryOption").hidden = state.builder.service !== "walk" || Number(state.builder.duration) < 60;
    document.getElementById("boardingDays").textContent = state.builder.boardingDays + (state.builder.boardingDays === 1 ? " сутки" : state.builder.boardingDays < 5 ? " суток" : " суток");
    var current = state.builder.service === "boarding" ? priceFor({ service: "boarding", boardingDays: state.builder.boardingDays }) : priceFor(Object.assign({ service: "walk" }, state.builder));
    document.getElementById("unitPrice").textContent = money(current);
    document.getElementById("selectedDateLabel").textContent = state.builder.date ? dateLabel(state.builder.date) + ", " + state.builder.time : "Выберите день и время";
  }
  function cartCount() { return state.cart.length; }
  function renderCart() {
    var total = cartTotal();
    document.getElementById("cartCount").textContent = String(cartCount());
    document.getElementById("emptyCart").hidden = cartCount() > 0;
    document.getElementById("cartTotalBlock").hidden = cartCount() === 0;
    document.getElementById("subscriptionRow").hidden = total.walks === 0 || cartCount() === 0;
    document.getElementById("checkoutButton").disabled = cartCount() === 0;
    document.getElementById("subtotalPrice").textContent = money(total.subtotal);
    document.getElementById("discountAmount").textContent = "−" + money(total.discount);
    document.getElementById("totalPrice").textContent = money(total.total);
    document.getElementById("discountLine").hidden = total.discount === 0;
    document.getElementById("subscriptionSelect").value = String(state.draft.subscription || 0);
    document.getElementById("cartList").innerHTML = state.cart.map(function (item) {
      var title = item.service === "boarding" ? "Передержка · " + item.boardingDays + " сут." : "Прогулка · " + item.duration + " мин";
      var extras = item.service === "boarding" ? "Домашняя забота" : [item.wash && "мытьё лап", item.secondDog && "вторая собака", item.withOthers && "в компании", item.photoEvery && "частые фото"].filter(Boolean).join(" · ") || "Фотоотчёт включён";
      return '<article class="cart-item"><div class="cart-item-top"><div><div class="cart-item-title">' + esc(title) + '</div><p class="cart-item-meta">' + esc(dateLabel(item.date)) + " · " + esc(item.time) + " · " + esc(extras) + '</p></div><b class="cart-item-price">' + money(priceFor(item)) + '</b></div><div class="cart-item-actions"><button type="button" data-action="edit-cart" data-id="' + esc(item.id) + '">Изменить</button><button type="button" data-action="remove-cart" data-id="' + esc(item.id) + '">Удалить</button></div></article>';
    }).join("");
    var count = state.appointments.length;
    var badge = document.getElementById("clientOrderCount");
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }
  function servicePriceCopy() {
    document.querySelector('[data-service="boarding"] small').textContent = money(state.prices.boarding) + " / сутки";
    document.querySelector('[data-service="walk"] small').textContent = "от " + money(Math.min.apply(null, WALK_DURATIONS.map(function (duration) { return Number(state.prices.walk[duration]); })));
  }
  function updateCompany() {
    var company = state.company;
    document.getElementById("sitterNameMini").textContent = company.name || "Ситтер";
    document.getElementById("profileName").textContent = company.name || "Ситтер";
    document.getElementById("profileDistrict").textContent = (company.district || "Ваш район") + " · 4 года заботы о собаках";
    document.getElementById("profileDistrictFact").textContent = company.district || "Ваш район";
    document.getElementById("districtLabel").textContent = "Прогулки · " + (company.district || "ваш район");
    var hue = /^#[0-9a-f]{6}$/i.test(company.accent || "") ? company.accent : "#3f899e";
    document.documentElement.style.setProperty("--blue", hue);
    document.documentElement.style.setProperty("--blue-deep", hue);
  }
  function requestSummary(request) {
    var services = request.items.map(function (item) {
      return (item.service === "boarding" ? "Передержка · " + item.boardingDays + " суток" : "Прогулка · " + item.duration + " мин") + " · " + dateLabel(item.date) + " · " + item.time;
    }).join("<br>");
    return services;
  }
  function renderClientOrders() {
    var orders = document.getElementById("clientOrders");
    document.getElementById("emptyOrders").hidden = state.appointments.length > 0;
    orders.innerHTML = state.appointments.slice().reverse().map(function (request) {
      var phone = request.status === "approved" || request.status === "completed" ? '<a class="phone-reveal" href="tel:' + esc(request.sitterPhone) + '">☎ ' + esc(request.sitterPhone) + '</a>' : '<span class="private-note-hint">Телефон откроется после подтверждения</span>';
      var items = request.items.map(function (item) {
        return '<div class="request-detail-item"><span>' + esc(item.service === "boarding" ? "Передержка" : "Прогулка " + item.duration + " мин") + '</span><b>' + esc(dateLabel(item.date)) + " · " + esc(item.time) + "</b></div>";
      }).join("");
      var gps = request.status === "completed" ? '<div class="gps-card"><svg viewBox="0 0 34 26" aria-hidden="true"><path d="M2 19c8 1 7-11 15-11s7 12 15 3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="2 4"/></svg><span>Демо GPS-трек · прогулка завершена</span></div><p class="request-client-info">Фотоотчёт отправлен · возврат собаки подтверждён</p>' : "";
      return '<article class="panel order-card"><div class="request-card-head"><div><h2>Заявка ' + esc(request.id) + '</h2><p>' + esc(request.customer.name) + " · " + esc(request.dog.name) + " (" + esc(request.dog.breed) + ')</p></div><span class="status-pill ' + statusClass(request.status) + '">' + statusName(request.status) + '</span></div><div class="order-items">' + items + '</div><div class="order-card-footer"><b>К оплате: ' + money(request.total) + '</b>' + phone + '</div>' + gps + '</article>';
    }).join("");
  }
  function renderDashboardSummary() {
    var next = state.appointments.filter(function (request) { return request.status === "approved"; }).length;
    var fresh = state.appointments.filter(function (request) { return request.status === "new"; }).length;
    document.getElementById("newRequestCount").textContent = String(fresh);
    document.getElementById("dashboardSummary").innerHTML =
      '<div class="summary-tile"><span>Новые заявки</span><b>' + fresh + '</b><small>ждут ответа</small></div>' +
      '<div class="summary-tile"><span>Согласованные</span><b>' + next + '</b><small>в расписании</small></div>' +
      '<div class="summary-tile"><span>Всего заявок</span><b>' + state.appointments.length + '</b><small>в этом браузере</small></div>' +
      '<div class="summary-tile"><span>Свободные часы</span><b>9–18</b><small>по будням и выходным</small></div>';
  }
  function renderRequests() {
    var query = (document.getElementById("requestSearch") || {}).value || "";
    var filter = (document.getElementById("requestFilter") || {}).value || "all";
    var list = state.appointments.slice().reverse().filter(function (request) {
      var haystack = [request.id, request.customer.name, request.customer.phone, request.customer.address, request.dog.name, request.dog.breed].join(" ").toLowerCase();
      return (!query || haystack.indexOf(query.toLowerCase()) !== -1) && (filter === "all" || request.status === filter);
    });
    var html = '<div class="requests-toolbar"><label class="sr-only" for="requestSearch">Поиск заявок</label><input id="requestSearch" type="search" placeholder="Имя, собака или номер заявки" value="' + esc(query) + '"><label class="sr-only" for="requestFilter">Фильтр заявок</label><select id="requestFilter" class="filter-select"><option value="all"' + (filter === "all" ? " selected" : "") + '>Все статусы</option><option value="new"' + (filter === "new" ? " selected" : "") + '>Новые</option><option value="approved"' + (filter === "approved" ? " selected" : "") + '>Согласованные</option><option value="completed"' + (filter === "completed" ? " selected" : "") + '>Завершённые</option><option value="cancelled"' + (filter === "cancelled" ? " selected" : "") + '>Отменённые</option></select></div>';
    if (!list.length) return html + '<div class="no-results">' + (state.appointments.length ? "Заявок по этому фильтру нет." : "Новых заявок пока нет. Отправьте демонстрационную заявку из клиентского режима.") + "</div>";
    html += '<div class="requests-list">';
    html += list.map(function (request) {
      var items = request.items.map(function (item) {
        return '<div class="request-detail-item"><span>' + esc(item.service === "boarding" ? "Передержка · " + item.boardingDays + " суток" : "Прогулка · " + item.duration + " мин") + '</span><b>' + esc(dateLabel(item.date)) + " · " + esc(item.time) + "</b></div>";
      }).join("");
      var actions = request.status === "new" ? '<div class="request-actions">' + request.items.map(function (item, index) {
        return '<label>Позиция ' + (index + 1) + ' · дата и время<input type="datetime-local" required data-confirm-time="' + esc(request.id) + '" data-item-index="' + index + '" value="' + esc(dateTimeLocal(item.date, item.time)) + '"></label>';
      }).join("") + '<button class="button button-primary" type="button" data-action="approve" data-id="' + esc(request.id) + '">Подтвердить</button><button class="button button-secondary" type="button" data-action="cancel-request" data-id="' + esc(request.id) + '">Отменить</button></div>' : "";
      var finish = request.status === "approved" ? '<div class="request-status-actions"><button class="button button-primary" type="button" data-action="complete" data-id="' + esc(request.id) + '">Добавить фотоотчёт и завершить</button><button class="button button-secondary" type="button" data-action="cancel-request" data-id="' + esc(request.id) + '">Отменить</button></div>' : "";
      var privateNote = '<div class="private-note"><label>Приватная заметка ситтера<textarea data-private-note="' + esc(request.id) + '" maxlength="500" placeholder="Виден только ситтеру">' + esc(request.privateNote || "") + '</textarea></label><button class="button button-secondary" type="button" data-action="save-note" data-id="' + esc(request.id) + '">Сохранить заметку</button></div><p class="private-note-hint">Заметка хранится только в кабинете.</p>';
      return '<article class="panel request-card"><div class="request-card-head"><div><h2>' + esc(request.customer.name) + " · " + esc(request.dog.name) + '</h2><p>' + esc(request.dog.breed) + " · " + esc(request.customer.address) + '</p><span class="request-code">' + esc(request.id) + " · " + esc(request.customer.phone) + '</span></div><span class="status-pill ' + statusClass(request.status) + '">' + statusName(request.status) + '</span></div><div class="request-card-grid"><div class="request-listing"><b>Услуги и время</b>' + items + '</div><div class="request-listing"><b>Комментарий хозяина</b><p>' + esc(request.customer.comment || "Без комментария") + '</p><p><b>К оплате · ' + money(request.total) + '</b></p></div></div>' + actions + finish + privateNote + "</article>";
    }).join("");
    return html + "</div>";
  }
  function renderSchedule() {
    var days = "";
    var now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (var day = 0; day < 7; day += 1) {
      var date = new Date(start);
      date.setDate(start.getDate() + day);
      var key = dateKey(date);
      var slots = "";
      for (var hour = 9; hour < 18; hour += 1) {
        var time = String(hour).padStart(2, "0") + ":00";
        var busy = approvedTimeBusy(key, time);
        slots += '<span class="schedule-slot' + (busy ? " is-busy" : "") + '">' + time + "</span>";
      }
      days += '<div class="schedule-day-row"><span class="schedule-date">' + esc(dateLabel(key)) + '</span><div class="schedule-hours">' + slots + "</div></div>";
    }
    var bookings = state.appointments.filter(function (request) { return request.status === "approved"; });
    return '<div class="schedule-wrap"><section class="panel schedule-panel"><h2>Занятость на 7 дней</h2><p class="section-desc">Рабочие часы · 9:00–18:00</p><div class="schedule-day">' + days + '</div><div class="schedule-legend"><span><i></i>Свободно</span><span><i class="busy-key"></i>Занято</span></div></section><aside class="panel schedule-notes"><h2>Согласованные прогулки</h2><p>Подтверждённые заявки блокируют своё время.</p>' + (bookings.length ? bookings.map(function (request) {
      return '<div class="schedule-booking"><b>' + esc(request.customer.name) + " · " + esc(request.dog.name) + '</b><span>' + request.items.map(function (item) { return esc(dateLabel(item.date) + " · " + item.time); }).join("<br>") + "</span></div>";
    }).join("") : '<p class="no-results">Пока нет занятых слотов.</p>') + "</aside></div>";
  }
  function renderTariffs() {
    return '<section class="panel settings-panel"><p class="eyebrow">Сервис</p><h2>Тарифы и услуги</h2><p class="section-desc">Изменения сразу применяются к расчёту новых заявок и сохраняются в этом браузере.</p><form class="settings-form" data-form="tariffs">' +
      WALK_DURATIONS.map(function (duration) { return '<label class="settings-field">Прогулка · ' + duration + ' мин<span class="price-input-wrap"><input name="walk' + duration + '" type="number" min="0" step="10" required value="' + Number(state.prices.walk[duration]) + '"><span>₽</span></span></label>'; }).join("") +
      '<label class="settings-field">Мытьё лап<span class="price-input-wrap"><input name="wash" type="number" min="0" step="10" required value="' + Number(state.prices.wash) + '"><span>₽</span></span></label><label class="settings-field">Передержка · сутки<span class="price-input-wrap"><input name="boarding" type="number" min="0" step="50" required value="' + Number(state.prices.boarding) + '"><span>₽</span></span></label><p class="private-note-hint settings-full">Фотоотчёт включён · вторая собака +50% · абонементы: 10/20/30 прогулок со скидкой 5/10/15%.</p><div class="settings-actions"><button class="button button-primary" type="submit">Сохранить тарифы</button></div></form></section>';
  }
  function renderDogs() {
    var dogs = {};
    state.appointments.forEach(function (request) {
      var key = (request.dog.name + " " + request.dog.breed).toLowerCase();
      if (!dogs[key]) dogs[key] = { name: request.dog.name, breed: request.dog.breed, customer: request.customer.name, phone: request.customer.phone, count: 0 };
      dogs[key].count += 1;
    });
    var list = Object.keys(dogs).map(function (key) { return dogs[key]; });
    if (!list.length) return '<div class="no-results">Профили собак появятся здесь после первой заявки.</div>';
    return '<div class="dog-profile-grid">' + list.map(function (dog) {
      return '<article class="dog-profile-card"><span class="dog-emoji">🐕</span><h2>' + esc(dog.name) + '</h2><p>' + esc(dog.breed) + '</p><p>Хозяин: ' + esc(dog.customer) + '</p><p>' + esc(dog.phone) + '</p><p>Заявок: ' + dog.count + "</p></article>";
    }).join("") + "</div>";
  }
  function renderCompany() {
    return '<section class="panel settings-panel"><p class="eyebrow">Профиль ситтера</p><h2>Компания и контакты</h2><p class="section-desc">Публичные данные отображаются клиенту. Телефон показываем только после согласования.</p><form class="settings-form" data-form="company"><label class="settings-field">Имя / название<input name="name" required maxlength="80" value="' + esc(state.company.name) + '"></label><label class="settings-field">Телефон ситтера<input name="phone" type="tel" required maxlength="30" value="' + esc(state.company.phone) + '"></label><label class="settings-field">Район прогулок<input name="district" required maxlength="100" value="' + esc(state.company.district) + '"></label><label class="settings-field">Акцентный цвет<input name="accent" type="color" value="' + esc(state.company.accent) + '"></label><div class="settings-actions"><button class="button button-primary" type="submit">Сохранить профиль</button></div></form></section>';
  }
  function renderAccess() {
    return '<div class="access-layout"><section class="panel access-card"><h2>Доступ к кабинету</h2><p>В учебном макете переключение ролей открыто, пароль сохраняется локально и не обеспечивает настоящую защиту.</p><form data-form="password"><label>Новый демо-пароль<input name="password" type="password" minlength="4" required autocomplete="new-password" placeholder="Не менее 4 символов"></label><button class="button button-primary" type="submit">Сохранить пароль</button></form><button class="button button-secondary" type="button" data-action="role" style="margin-top:12px">Выйти из кабинета</button></section><section class="panel access-info"><h2>Хранение демо-данных</h2><p>Корзина, черновик, заявки, тарифы и настройки этой страницы находятся в localStorage текущего браузера. Для публикации макета не нужен сервер приложений.</p><ul><li>Не вводите настоящие платёжные данные.</li><li>Клиент и ситтер видят один и тот же стор на этом устройстве.</li><li>Обмен между разными устройствами не реализован.</li></ul></section></div>';
  }
  function renderSitterContent() {
    var tab = state.sitterTab || "requests";
    document.querySelectorAll("[data-sitter-tab]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.sitterTab === tab);
    });
    var content = document.getElementById("sitterContent");
    if (tab === "schedule") content.innerHTML = renderSchedule();
    else if (tab === "tariffs") content.innerHTML = renderTariffs();
    else if (tab === "dogs") content.innerHTML = renderDogs();
    else if (tab === "company") content.innerHTML = renderCompany();
    else if (tab === "access") content.innerHTML = renderAccess();
    else content.innerHTML = renderRequests();
  }
  function render() {
    setTheme(state.theme);
    syncRole();
    renderDates();
    renderTimes();
    updateBuilderControls();
    renderCart();
    servicePriceCopy();
    updateCompany();
    renderClientOrders();
    renderDashboardSummary();
    renderSitterContent();
    if (document.getElementById("checkoutDialog") && document.getElementById("checkoutDialog").open) {
      document.getElementById("dialogTotal").textContent = money(cartTotal().total);
    }
  }

  function resetBuilder() {
    state.builder = Object.assign(clone(DEFAULTS.builder), { date: state.builder.date || dateKey(new Date(Date.now() + 86400000)) });
  }
  function addToCart() {
    if (!state.builder.date) state.builder.date = dateKey(new Date(Date.now() + 86400000));
    if (approvedTimeBusy(state.builder.date, state.builder.time)) {
      showToast("Это время уже занято. Выберите другой слот.");
      return;
    }
    if (state.builder.date === dateKey(new Date()) && nowTimeIsPast(state.builder.date, state.builder.time)) {
      showToast("Выберите время, которое ещё не прошло.");
      return;
    }
    var item = Object.assign({}, clone(state.builder), { id: uid("CART") });
    state.cart.push(item);
    save();
    showToast("Добавлено в корзину");
  }
  function editCart(id) {
    var index = state.cart.findIndex(function (item) { return item.id === id; });
    if (index < 0) return;
    var item = state.cart.splice(index, 1)[0];
    state.builder = Object.assign(clone(DEFAULTS.builder), item);
    if (!document.querySelector('[data-date="' + item.date + '"]')) {
      state.builder.date = item.date;
    }
    save();
    navigate("booking");
    showToast("Параметры загружены — измените и добавьте снова");
  }
  function navigate(page) {
    document.querySelectorAll(".client-page").forEach(function (section) {
      var active = section.dataset.page === page;
      section.hidden = !active;
      section.classList.toggle("is-visible", active);
    });
    document.querySelectorAll("[data-nav]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.nav === page);
    });
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function openCheckout() {
    if (!state.cart.length) return;
    if (!state.draft.idempotencyKey) state.draft.idempotencyKey = uid("SUBMIT");
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    fillCheckoutDraft();
  }
  function submitOrder(event) {
    event.preventDefault();
    var form = event.currentTarget;
    if (!form.reportValidity()) return;
    captureDraft();
    if (!state.cart.length) {
      showToast("Корзина пуста");
      return;
    }
    var existing = state.appointments.find(function (request) { return request.submissionKey === state.draft.idempotencyKey; });
    if (existing) {
      state.lastRequestId = existing.id;
      document.getElementById("checkoutDialog").close();
      showSuccess(existing);
      return;
    }
    var total = cartTotal();
    var request = {
      id: "ГУ-" + String(Date.now()).slice(-6),
      submissionKey: state.draft.idempotencyKey || uid("SUBMIT"),
      createdAt: new Date().toISOString(),
      status: "new",
      items: clone(state.cart),
      total: total.total,
      customer: { name: state.draft.name.trim(), phone: state.draft.phone.trim(), address: state.draft.address.trim(), comment: state.draft.comment.trim() },
      dog: { name: state.draft.dogName.trim(), breed: state.draft.breed.trim() },
      sitterPhone: state.company.phone,
      privateNote: "",
      subscription: Number(state.draft.subscription || 0),
      discount: total.discount
    };
    state.appointments.push(request);
    state.cart = [];
    state.draft = Object.assign(clone(DEFAULTS.draft), { idempotencyKey: uid("SUBMIT") });
    state.lastRequestId = request.id;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    document.getElementById("checkoutDialog").close();
    render();
    showSuccess(request);
  }
  function showSuccess(request) {
    render();
    document.getElementById("successNumber").textContent = request.id;
    document.getElementById("successCopy").textContent = request.customer.name + ", ситтер получил заявку и свяжется с вами для подтверждения времени.";
    var status = document.getElementById("successStatus");
    status.textContent = statusName(request.status);
    status.className = "status-pill " + statusClass(request.status);
    navigate("success");
  }
  function updateStatus(id, status, chosenTime) {
    var request = state.appointments.find(function (item) { return item.id === id; });
    if (!request) return;
    if (status === "approved" && chosenTime) {
      var plannedSlots = chosenTime.map(function (value) { return { date: value.slice(0, 10), time: value.slice(11, 16) }; });
      var slotKeys = plannedSlots.map(function (slot) { return slot.date + "T" + slot.time; });
      var collision = new Set(slotKeys).size !== slotKeys.length || state.appointments.some(function (other) {
        return other.id !== id && other.status === "approved" && (other.items || []).some(function (item) {
          return slotKeys.indexOf(item.date + "T" + item.time) !== -1;
        });
      });
      if (collision) {
        showToast("Один из выбранных слотов уже занят.");
        return;
      }
      request.items.forEach(function (item, index) {
        if (!plannedSlots[index]) return;
        item.date = plannedSlots[index].date;
        item.time = plannedSlots[index].time;
      });
    }
    request.status = status;
    request.updatedAt = new Date().toISOString();
    if (status === "completed") {
      request.photoReport = { type: "demo", createdAt: request.updatedAt, caption: "Прогулка завершена" };
      request.returnedAt = request.updatedAt;
    }
    save();
    showToast(status === "approved" ? "Время подтверждено — клиент увидит обновление." : status === "completed" ? "Фотоотчёт добавлен, возврат собаки подтверждён." : "Статус заявки изменён.");
  }
  function handleAction(button) {
    var action = button.dataset.action;
    var id = button.dataset.id;
    if (action === "theme") {
      state.theme = state.theme === "dark" ? "light" : "dark";
      save();
    } else if (action === "role") {
      state.role = state.role === "sitter" ? "client" : "sitter";
      if (state.role === "sitter") state.sitterTab = "requests";
      save();
    } else if (action === "add-to-cart") addToCart();
    else if (action === "checkout") openCheckout();
    else if (action === "close-checkout") document.getElementById("checkoutDialog").close();
    else if (action === "boarding-plus") { state.builder.boardingDays = Math.min(30, Number(state.builder.boardingDays || 1) + 1); save(); }
    else if (action === "boarding-minus") { state.builder.boardingDays = Math.max(1, Number(state.builder.boardingDays || 1) - 1); save(); }
    else if (action === "remove-cart") {
      state.cart = state.cart.filter(function (item) { return item.id !== id; });
      save();
      showToast("Позиция удалена");
    } else if (action === "edit-cart") editCart(id);
    else if (action === "new-order") {
      resetBuilder();
      save();
      navigate("booking");
    } else if (action === "approve") {
      var timeInputs = Array.prototype.slice.call(document.querySelectorAll('[data-confirm-time="' + id + '"]'));
      if (!timeInputs.length || timeInputs.some(function (input) { return !input.value; })) {
        showToast("Укажите дату и время для каждой позиции.");
        return;
      }
      updateStatus(id, "approved", timeInputs.map(function (input) { return input.value; }));
    } else if (action === "cancel-request") updateStatus(id, "cancelled");
    else if (action === "complete") {
      var confirmed = window.confirm("Добавить демо-фотоотчёт и подтвердить возврат собаки хозяину?");
      if (confirmed) updateStatus(id, "completed");
    } else if (action === "save-note") {
      var note = document.querySelector('[data-private-note="' + id + '"]');
      var request = state.appointments.find(function (item) { return item.id === id; });
      if (request && note) { request.privateNote = note.value.trim(); save(); showToast("Приватная заметка сохранена."); }
    }
  }
  function submitSettings(form) {
    var data = new FormData(form);
    if (form.dataset.form === "tariffs") {
      WALK_DURATIONS.forEach(function (duration) { state.prices.walk[duration] = Math.max(0, Number(data.get("walk" + duration))); });
      state.prices.wash = Math.max(0, Number(data.get("wash")));
      state.prices.boarding = Math.max(0, Number(data.get("boarding")));
      save();
      showToast("Тарифы сохранены");
    } else if (form.dataset.form === "company") {
      state.company = { name: String(data.get("name")).trim(), phone: String(data.get("phone")).trim(), district: String(data.get("district")).trim(), accent: String(data.get("accent")) };
      state.appointments.forEach(function (request) {
        if (request.status === "new") request.sitterPhone = state.company.phone;
      });
      save();
      showToast("Профиль обновлён");
    } else if (form.dataset.form === "password") {
      state.password = String(data.get("password") || "");
      save();
      showToast("Демо-пароль сохранён");
      form.reset();
    }
  }

  document.addEventListener("click", function (event) {
    var action = event.target.closest("[data-action]");
    if (action) { handleAction(action); return; }
    var nav = event.target.closest("[data-nav]");
    if (nav) {
      event.preventDefault();
      navigate(nav.dataset.nav);
      return;
    }
    var service = event.target.closest("[data-service]");
    if (service) {
      state.builder.service = service.dataset.service;
      if (state.builder.service === "boarding") state.builder.wash = false;
      save();
      return;
    }
    var duration = event.target.closest("[data-duration]");
    if (duration) {
      state.builder.duration = Number(duration.dataset.duration);
      if (state.builder.duration < 60) state.builder.photoEvery = false;
      save();
      return;
    }
    var date = event.target.closest("[data-date]");
    if (date) {
      state.builder.date = date.dataset.date;
      var currentButton = document.querySelector('[data-time="' + state.builder.time + '"]');
      if (!currentButton || currentButton.disabled) state.builder.time = "09:00";
      save();
      return;
    }
    var time = event.target.closest("[data-time]");
    if (time && !time.disabled) {
      state.builder.time = time.dataset.time;
      save();
      return;
    }
    var tab = event.target.closest("[data-sitter-tab]");
    if (tab) {
      state.sitterTab = tab.dataset.sitterTab;
      save();
    }
  });
  document.addEventListener("change", function (event) {
    var target = event.target;
    if (target.id === "washPaws") state.builder.wash = target.checked;
    else if (target.id === "secondDog") state.builder.secondDog = target.checked;
    else if (target.id === "withOthers") state.builder.withOthers = target.checked;
    else if (target.id === "photoEvery") state.builder.photoEvery = target.checked;
    else if (target.id === "subscriptionSelect") state.draft.subscription = Number(target.value);
    else if (target.id === "requestFilter") { renderSitterContent(); return; }
    else if (target.dataset.form) { return; }
    else return;
    save();
  });
  document.addEventListener("input", function (event) {
    if (event.target.id === "requestSearch") {
      var selectionStart = event.target.selectionStart;
      var value = event.target.value;
      renderSitterContent();
      var replacement = document.getElementById("requestSearch");
      replacement.focus();
      replacement.setSelectionRange(selectionStart, selectionStart);
    }
  });
  document.addEventListener("submit", function (event) {
    var form = event.target.closest("[data-form]");
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    submitSettings(form);
  });
  window.addEventListener("storage", function (event) {
    if (event.key !== STORE_KEY || !event.newValue) return;
    state = readStore();
    render();
  });
  window.addEventListener("focus", function () { state = readStore(); render(); });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { state = readStore(); render(); }
  });

  if (!state.builder.date) state.builder.date = dateKey(new Date(Date.now() + 86400000));
  document.documentElement.dataset.theme = state.theme;
  ensureDialog();
  render();
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () { /* Offline caching is available on supported static hosts. */ });
    });
  }
}());
