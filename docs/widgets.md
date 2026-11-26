# Making a widget

A widget is a small web page of your own on a tile of the dashboard: HTML, CSS and JavaScript in one file, with a few settings. It runs in a sandboxed frame, gets the values of the theme so it looks at home, and can read and control the devices that are chosen for it when it is placed. Two examples are next to this file: `widgets/gauge.widget.json` (a value on a dial) and `widgets/big-switch.widget.json` (one large on/off button).

To use one: Edit → Add a tile → Widgets → Add a widget, then paste the file's text (or its share code) or choose the file. The dashboard shows what the widget may do before it is added. It is placed only when you tap its plus.

## The file

```json
{
  "format": "expressive-home-widget",
  "version": 1,
  "id": "gauge",
  "name": { "en": "Gauge", "nl": "Meter" },
  "description": { "en": "One value of a device on a dial" },
  "icon": "speed",
  "widgetVersion": "1.0.0",
  "sizes": ["single", "wide"],
  "settings": [
    { "id": "device", "type": "device", "title": { "en": "Device", "nl": "Apparaat" } },
    { "id": "capability", "type": "capability", "device": "device", "title": "Value" },
    { "id": "min", "type": "number", "title": "Lowest", "default": 0 }
  ],
  "html": "<div class=\"gauge\">…</div>",
  "css": ".gauge { color: var(--tile-fg); }",
  "js": "function onHomeyReady(Homey) { …; Homey.ready(); }",
  "texts": { "en": { "none": "No value" }, "nl": { "none": "Geen waarde" } }
}
```

- `id`: lower-case letters, digits and `-`, at most 40. A widget with the same id replaces the one the house has.
- `name`, `description`, `title`: a string, or `{ "en": …, "nl": … }`.
- `icon`: the name of one of the dashboard's Material Symbols; otherwise the widget icon is used.
- `sizes`: `single` (one place) and/or `wide` (two places); the first is used when it is placed.
- `settings`: at most 12, of the types `text`, `textarea`, `number` (`min`, `max`), `checkbox`, `dropdown` (`values: [{ "id", "title" }]`), `device`, `capability` (a value of the device in the setting named by `device`) and `flow`. They are filled in under "Set up widget" and kept per placed widget.
- The whole file is at most 100 kB.

The `html` is markup only: `<script>` in it never runs and `onclick="…"` attributes are blocked. Put all code in `js`.

## The `Homey` object

Define `function onHomeyReady(Homey) { … }` in `js`; it is called once the page is ready. The names follow Homey's own widgets where they overlap.

| | |
|---|---|
| `Homey.ready({ height })` | Shows the widget. Until then the tile shows nothing; after 10 seconds without it, the widget is stopped. |
| `Homey.setHeight(px)` | Between one and four tile heights. |
| `Homey.getSettings()` | The settings of this placed widget. |
| `Homey.getWidgetInstanceId()` | The id of this placed widget. |
| `Homey.getDeviceIds()` | The devices chosen for it. |
| `Homey.__(key)` | A text from `texts`, in the language of the dashboard. |
| `Homey.language()` | `en` or `nl`. |
| `Homey.on('device', fn)` | A chosen device changed; `fn` gets the device. |
| `Homey.on('theme', fn)` | The theme changed. When the settings change, the widget starts again. |
| `Homey.devices.get(id)` | `{ id, name, class, available, capabilities: { onoff: { value, title, type, units, min, max, step, setable, … } } }` of a chosen device; `null` for any other. |
| `Homey.devices.setCapabilityValue(id, capabilityId, value)` | Controls a chosen device. Resolves to `done`, `declined` (the question was answered no) or `refused` (not allowed, not settable, wrong type, too often). |
| `Homey.flows.start(id)` | Starts a chosen flow; `done` or `refused`. |
| `Homey.openDevice(id)` | Opens the window of a chosen device in the dashboard. |
| `Homey.theme()` | `{ tokens, mode, density }`. |

## What a widget can and cannot do

- It sees only the devices and flows chosen in its settings.
- A lock, a garage door or an alarm is never switched directly: the dashboard asks its own question, naming the widget, at most once per 30 seconds.
- At most 20 commands per 10 seconds, and 200 messages per second; a widget that sends more is stopped.
- No network at all (`fetch`, images or fonts from elsewhere, WebSockets), no storage, no cookies, no pop-ups, no alerts, no navigating away; it cannot reach the page around it. Images can be `data:` addresses.
- The dashboard asks for a sign of life every 5 seconds; a widget that stays silent for 10 seconds is stopped with "not responding". The dashboard carries on.
- Escape always gives the focus back to the dashboard.
- Opening the dashboard with `#safe` (or `#veilig`) after its address turns all own widgets off for that visit.

## Looking at home

The theme's values are CSS variables on `:root`, with the same names as in `docs/design/tokens.css`: `var(--c-primary)`, `var(--tile-fg)`, `var(--tile-state-fg)`, `var(--tile-on-bg)`, `var(--font-family)`, `var(--type-label-l-size)`, `var(--tile-pad)`, `var(--motion-spatial)` and so on. `data-mode` (`light`/`dark`) and `data-density` are on the root element. The tile draws its own background and shape; the frame is transparent.

Please: targets of at least 48 by 48 pixels, a label for every control (`aria-label`), and no movement with `@media (prefers-reduced-motion: reduce)`.

## Widgets of other apps

With a key with full access on the app's settings page, the dashboard can also show the widgets that other apps on the Homey bring along. They run in the same kind of sandboxed frame and look as their app made them. What such a widget asks of its own app goes through the app on the Homey, with the key, which never leaves the Homey.

Live news: when an app sends its widget news (`this.homey.api.realtime(name, data)`), the widget hears it with `Homey.on(name, fn)`, as on Homey's own dashboard. The app on the Homey listens only to apps of widgets that stand on a dashboard and that the Homey lists, passes on only the names a widget listens to, and holds every app to 20 messages and 64 KB a second (the newest of each name comes when it may). The settings page says whether it works.

Good to know:

- Every paired device can get the live news of an app whose widget stands on a dashboard, as it can already ask such a widget's own app for its data. Never let a widget carry anything secret.
- Homey's own script in a widget page does not check who a message comes from, so in some browsers widgets of different apps could send each other false news. The dashboard cannot change that script.
- The way the dashboard talks with these widget pages is Homey's own and not documented; an update of the Homey can change it.
