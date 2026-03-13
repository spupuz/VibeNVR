---
description: Update repository-level documentation (*.md) and project Wiki
---

# Documentation & Wiki Sync Workflow

This workflow ensures that all technical documentation, repository-level guides, and project Wiki pages are kept up-to-date with the latest codebase features, structural changes, and security policies.

### Steps:

1. **Identify Documentation Needs**
   - Analyze recent code changes for:
     - New features (e.g., Multiple Storage Profiles).
     - API endpoint modifications or additions.
     - New environment variables or configuration options.
     - Changes to security logic or RBAC.
     - UI/UX refinements that impact usage instructions.

2. **Update Core Markdown Files**
   - **README.md**: Update feature lists, screenshots/videos references, or quick-start guides.
   - **SECURITY.md**: Update security architecture, RBAC descriptions, or vulnerability mitigations.
   - **CONTEXT.md / AGENTS.md**: Ensure project context and agent instructions reflect the current architecture.

3. **Wiki Maintenance (`wiki/` directory)**
   - **Review Existing Pages**: Check for outdated parameters or instructions in `Home.md`, `API.md`, etc.
   - **Update Features**: Add new sections to technical guides for significant updates.
   - **Create New Pages**: If a feature introduces a major new subsystem (e.g., `Storage-Management.md`), create a new document in the `wiki/` directory.
   - **Standard Naming**: Use `Kebab-Case.md` or `CamelCase.md` consistent with existing Wiki files.

4. **Consistency & Formatting**
   - Ensure all `*.md` files use consistent Header hierarchies (H1 -> H2 -> H3).
   - Use GitHub-style alerts (`> [!NOTE]`, `> [!WARNING]`) for critical info.
   - Verify all local links between documents are valid.
   - Ensure a "premium" tone: professional, concise, and helpful.

5. **Final Verification**
   - Use `view_file` to proofread the updated documents.
   - Ensure no temporary notes or placeholders are left in the final versions.

### Output Requirements:
The documentation update report must include:
- **Modified Markdown Files**: List of updated repository files.
- **Wiki Updates**: List of modified or newly created Wiki pages.
- **Key Changes**: Bullet points of major information updates (e.g., "Added Storage Profile API documentation").
- **Consistency Check**: Confirmation that naming conventions and styles match existing docs.

### Prompt to Reuse:
> "Perform a documentation and Wiki audit based on the latest project changes. Identify outdated sections in `README.md`, `SECURITY.md`, and the `wiki/` directory. Update existing documents to reflect the latest features and architectural patterns. If necessary, create new Wiki pages for major subsystems. Ensure high-quality formatting, valid links, and consistency across all markdown files. Provide a summary of all documentation changes."
