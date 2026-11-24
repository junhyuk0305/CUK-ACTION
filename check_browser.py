from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent
for script in ["check_student.py", "check_manager.py", "check_autosave_race.py", "check_student_ux.py", "check_dashboard_flow.py", "check_workflow.py", "check_core_validation.py"]:
    subprocess.run([sys.executable, str(root / "scripts" / script)], cwd=root, check=True)
