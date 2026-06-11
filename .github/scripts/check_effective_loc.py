import argparse
from dataclasses import dataclass
from pathlib import Path

JS_EXTS = {".js", ".jsx", ".ts", ".tsx"}
PY_EXTS = {".py"}

DEFAULT_EXCLUDED_DIRS = {
    ".git", ".venv", "venv", "__pycache__", ".mypy_cache", 
    ".pytest_cache", ".ruff_cache", "node_modules", "dist", "build", "coverage"
}

@dataclass(frozen=True)
class FileCount:
    path: Path
    effective: int
    total: int

def is_excluded(path: Path, excluded_dir_names: set[str]) -> bool:
    return any(part in excluded_dir_names for part in path.parts)

def read_text_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8", errors="ignore").splitlines()

def count_effective_loc_python(lines: list[str]) -> int:
    n = 0
    for line in lines:
        s = line.strip()
        if not s or s.startswith("#"): continue
        n += 1
    return n

def count_effective_loc_js_like(lines: list[str]) -> int:
    n = 0
    in_block = False
    for line in lines:
        if in_block:
            end = line.find("*/")
            if end == -1: continue
            in_block = False
            rest = line[end + 2 :].strip()
            if not rest: continue
            s = rest
        else:
            s = line.strip()
        if not s or s.startswith("//"): continue
        if s.startswith("/*"):
            end = s.find("*/")
            if end == -1:
                in_block = True
                continue
            rest = s[end + 2 :].strip()
            if not rest: continue
            n += 1
            continue
        n += 1
    return n

def count_effective_loc(path: Path, lines: list[str]) -> int:
    if path.suffix in PY_EXTS: return count_effective_loc_python(lines)
    if path.suffix in JS_EXTS: return count_effective_loc_js_like(lines)
    return 0

def iter_source_files(repo_root: Path, include_dirs: list[str], extensions: set[str], excluded_dir_names: set[str]) -> list[Path]:
    out: list[Path] = []
    for d in include_dirs:
        base = (repo_root / d).resolve()
        if not base.exists(): continue
        for p in base.rglob("*"):
            if not p.is_file() or p.suffix not in extensions or is_excluded(p, excluded_dir_names):
                continue
            out.append(p)
    return out

def get_existing_files(repo_root: Path) -> set[str]:
    import subprocess
    try:
        result = subprocess.run(["git", "ls-tree", "-r", "origin/main", "--name-only"], cwd=repo_root, capture_output=True, text=True)
        if result.returncode != 0:
            result = subprocess.run(["git", "ls-tree", "-r", "main", "--name-only"], cwd=repo_root, capture_output=True, text=True)
        if result.returncode == 0:
            return set(result.stdout.splitlines())
    except Exception: pass
    return set()

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-new", type=int, default=500, help="Max LOC for new files")
    parser.add_argument("--max-legacy", type=int, default=1000, help="Max LOC for existing (legacy) files")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    exts = PY_EXTS | JS_EXTS
    existing_files = get_existing_files(repo_root)
    include_dirs = ["backend", "engine", "frontend/src"]
    
    counts: list[FileCount] = []
    for path in iter_source_files(repo_root, include_dirs, exts, DEFAULT_EXCLUDED_DIRS):
        try: lines = read_text_lines(path)
        except Exception: continue
        counts.append(FileCount(path=path, effective=count_effective_loc(path, lines), total=len(lines)))

    violations = []
    for c in counts:
        rel_path = c.path.relative_to(repo_root).as_posix()
        is_legacy = rel_path in existing_files
        limit = args.max_legacy if is_legacy else args.max_new
        if c.effective > limit:
            violations.append((c, limit, is_legacy))

    if not violations:
        print(f"OK: no files exceed their LOC limits (New: {args.max_new}, Legacy: {args.max_legacy}).")
        return 0

    print("ERROR: file size limit violated (Policy: AGENTS.md).")
    for v, limit, is_legacy in violations:
        rel = v.path.relative_to(repo_root).as_posix()
        print(f"- {rel} [{'LEGACY' if is_legacy else 'NEW'}]: {v.effective} LOC (limit={limit})")
    return 1

if __name__ == "__main__":
    raise SystemExit(main())
