# Changelog

Version numbers follow [Semantic Versioning](https://semver.org/): `major.minor.patch`.
Bump with `npm version patch|minor|major` (updates `package.json` and creates a git tag),
then add an entry here. The version is shown at the bottom of the side navigation.

## [1.0.0] - 2026-11-06

### Changed
- UI moved from MUI to SAP UI5 Web Components for React (official SAP Fiori, Horizon theme):
  ShellBar + SideNavigation app shell, UI5 forms, tables, dialogs and charts across every module.
- Product list uses the table's built-in row selection.

### Added
- Default thumbnail (Pumpkin logo) for categories, subcategories, product groups and brands without an image.
- Full-screen loading indicator while logging out.
- App version shown in the side navigation.

### Fixed
- Navigation loading overlay now covers the whole content area on long pages.
- Collapsed side navigation hover item no longer hidden behind the breadcrumb bar.
- Password-manager autofill on login and password forms (native inputs).
