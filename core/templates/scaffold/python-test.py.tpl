# {{TC_ID}}: {{TC_TITLE}}
# Acceptance Criteria: {{AC_IDS}}
# {{AC_DESCRIPTIONS}}
import pytest

TC_MARKER = "// {{TC_ID}}: {{TC_TITLE}}"

def test_{{TEST_NAME}}():
    # TODO: Validate these acceptance criteria:
    # {{AC_DESCRIPTIONS}}
    pytest.fail("Not implemented: {{TC_ID}} — {{TC_TITLE}}")
