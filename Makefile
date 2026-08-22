.PHONY: validate tags links skills privacy

validate:
	python3 tools/check.py

tags:
	python3 tools/update_obsidian_tags.py
	python3 tools/update_obsidian_tags.py

links:
	python3 tools/validate_wiki_links.py

skills:
	python3 tools/validate_skill_system.py

privacy:
	python3 tools/privacy_scan.py
