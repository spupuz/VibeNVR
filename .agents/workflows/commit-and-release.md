---
description: Handle interactive commit, version bump (SemVer), tagging, and release notes
---

# Commit and Release Workflow

This workflow handles the process of committing changes, bumping versions, tagging releases, and pushing to the remote repository.

### Steps:

1. **Branch & History Verification (Mandatory)**
   - **Check Branch**: Run `git branch` to verify the current active branch.
   - **Visualize History**: Run `git log --graph --oneline --all -n 15` to visualize the relationship between `main`, `origin/main`, and your current branch.
   - **Rule**: Significant releases (Major/Minor) should ideally be performed from `main` after merging feature branches. If you are on a feature branch, ask the user if they want to merge into `main` before proceeding.

2. **Analyze and Commit Changes**
   - Run `git status` and `git diff` to identify all uncommitted changes.
   - **Mandatory**: Generate a detailed commit message that covers all modifications with enough technical detail.
   - Commit all changes: `git commit -am "<generated_detailed_notes>"`

3. **Determine Release Type**
   - Ask the user: "Is this a release? If so, specify the bump type: [major, minor, patch] or write 'none' to skip the release."

4. **Handle Release (if type is not 'none')**
   - **Identify Current Version**: Read `"version"` from `frontend/package.json` and `backend/package.json`.
   - **Calculate New Version**: Increment based on user choice (Major/Minor/Patch).
   - **Update Package Files**:
     - Update `version` in `frontend/package.json`.
     - Update `version` in `backend/package.json`.
   - **Commit Version Bump**: `git commit -am "chore: bump version to v<new_version>"`
   - **Create Tag**: `git tag v<new_version>`

5. **Push to Origin**
   - Ask the user: "Do you want to push to `origin main` (including tags if created)?"
   - **Rule**: If you performed a merge in Step 1, ensure you are pushing the updated `main` branch.
   - If yes: `git push origin main --tags`
   - **Tip**: To avoid triggering multiple redundant CI/CD builds (one for tag push, one for commit, one for release), you can create the **GitHub Release** immediately after pushing tags. A published release on GitHub can automatically include the tag and code, activating only the final production workflow.

6. **Generate Release Notes**
   - If a release was performed, output a **raw markdown block** containing the release notes.
   - **Mandatory Requirements**:
     - **Language**: Strictly **English**.
     - **Style**: Premium and distinctive (not a generic bullet list).
     - **Visuals**: Use relevant **emojis** to categorize changes.
   - Format:
     ```markdown
     # 🚀 Release v<new_version>
     
     ## 📝 Summary
     <premium_narrative_summary_of_changes>
     
     ## 🛠️ Key Improvements
     - 🚀 **<Component>**: <high_impact_description>
     - 🛡️ **<Security>**: <security_benefit_description>
     - 🎨 **<Aesthetics>**: <visual_improvement_description>
     ```

### Prompt to Reuse:
> "Run the commit and release workflow. Start by verifying the current branch and visualizing the commit history with `git log --graph`. Analyze uncommitted changes to generate commit notes, then ask me for the version bump type (major, minor, patch). Remember to update both package.json files and generate **premium, emoji-rich release notes in English**."
