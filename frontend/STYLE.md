# VibeNVR Design System

This document outlines the design principles and technical standards for the VibeNVR frontend. Following these guidelines ensures a consistent, premium user experience across the application.

## 🎨 Color Palette

We use HSL-based CSS variables defined in [index.css](file:///zfsfiles/DockerConfig/DockerSource/VibeNVR/frontend/src/index.css) to support both Light and Dark modes.

- **Background**: `--background` / `--card`
- **Primary**: `--primary` (Main brand color)
- **Secondary**: `--secondary` / `--muted`
- **Accent**: `--accent`
- **Destructive**: `--destructive` (Error/Danger)
- **Border**: `--border` / `--input`

## 📐 Spacing & Layout

- **Grid**: Standard Tailwind spacing scale (e.g., `p-4`, `m-2`).
- **Containers**: Use `max-w-7xl` for main page content where appropriate.
- **Gaps**: Use `gap-4` or `gap-6` for consistency between elements.

## ⭕ Border Radius (Crucial)

To maintain a cohesive look, use the following standard radius values:

| Element Type | Tailwind Class | Radius Value |
| :--- | :--- | :--- |
| **Small Interactive** (Buttons, Inputs, Badges) | `rounded-lg` | `0.5rem` |
| **Cards & Sections** | `rounded-xl` | `0.75rem` |
| **Modals & Overlays** | `rounded-2xl` | `1rem` |

> [!IMPORTANT]
> Avoid using `rounded-md` or `rounded-sm` for new components. Stick to the `rounded-lg` standard for inputs and buttons.

## 🧱 Component Usage

Always prioritize using standardized UI components located in `@/components/ui/`.

### Interactive Elements

- **Buttons**: Use the `Button` component.
  - `default`: Primary actions (solid background).
  - `outline`: Secondary actions or filters (border, transparent/light bg). Use this when the button needs to define its bounds clearly against the background.
  - `ghost`: Low priority actions, icon-only buttons, or distinct "Cancel" actions (no border/bg until hover).
  - `destructive`: Dangerous actions (Delete, Remove).
  - `secondary`: Alternative to default, often lighter background. Use sparingly if `outline` or `ghost` fits better.
  - Sizes: `default`, `sm`, `lg`, `icon`.
- **Inputs**: Use `InputField`.
  - Supports: `label`, `error`, `icon`, `unit`, `showPasswordToggle`.
- **Selects**: Use `SelectField`.
  - Pass options as an array of strings or `{ value, label }` objects.
- **Toggles**: Use `Toggle`.
  - Use `compact={true}` for list items or tight spaces.

### Layout & Feedback

- **Section Headers**: Use `SectionHeader` for consistent grouping.
- **Modals**: Use `Portal` for custom overlays and `ConfirmModal` for all confirm/alert dialogs (Do NOT use native `window.confirm()` or `window.alert()`).
- **Toast**: Use the `useToast` hook for user feedback.

## 🖋️ Typography

- **Font Family**: Modern sans-serif (Inter via Google Fonts).
- **Titles**: `text-xl` to `text-3xl` with `font-bold`.
- **Body**: `text-sm` (Default) or `text-base`.
- **Muted**: `text-muted-foreground` for auxiliary text.

## 🏗️ Architecture Patterns

- **Separation of Concerns**: Keep business logic in hooks or parent components; presentational logic in UI components.
- **Responsive Design**: Always test on mobile and desktop breakpoints. Use `sm:`, `md:`, `lg:` prefixes.
- **Dark Mode**: Use `dark:` variants for any custom color classes not covered by CSS variables.
