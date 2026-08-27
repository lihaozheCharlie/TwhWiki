#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import collections
import datetime as dt
import os
import re
import tempfile
from pathlib import Path

from vault_context import KNOWLEDGE_BASE_ROOT


ROOT = KNOWLEDGE_BASE_ROOT
DIARY_DIRS = [
    ROOT / "原始知识库" / "日记2013-2017",
    ROOT / "原始知识库" / "日记2018-2023",
    ROOT / "原始知识库" / "日记2024至今",
]
OUT_DIR = ROOT / "wiki" / "08 来源索引"
PER_DIARY_OUT = OUT_DIR / "逐篇日记实体索引.md"
CLASSMATE_OUT = OUT_DIR / "同学与同辈实体索引.md"


WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]")
FRONTMATTER_TAG_RE = re.compile(r"^\s*-\s+实体/(.+?)\s*$", re.MULTILINE)
DATE_LIKE_RE = re.compile(r"^(?:19|20)\d{2}[.,-]\d{1,2}|^(?:19|20)\d{2}$")
DATE_PREFIX_RE = re.compile(r"^(?P<year>20\d{2})[.\-](?P<month>\d{1,2})[.\-](?P<day>\d{1,2})")
SURNAMES = set("赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵汪祁毛禹狄米贝明臧计伏成戴宋庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄江童颜郭梅盛林刁钟徐邱骆高夏蔡田胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣邓郁单杭洪包诸左石崔吉龚程嵇邢裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘斜厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查後荆红游竺权逯盖益桓公")


KNOWN_PEOPLE = {
    # 亲人/长期关系
    "老婆", "柴柴", "猪娘", "女儿", "宝宝", "母亲", "父亲", "妈妈", "爸爸", "妹妹",
    "奶奶", "爷爷", "姥姥", "姥爷", "岳父", "岳母", "小姨", "小姨夫", "叔叔", "四姑", "二爷", "二奶",
    # 室友和学生同辈
    "王杰", "鹏宇", "尹鹏宇", "天哥", "啸天", "神", "杨东", "胡策", "胡哥", "张凡", "杨墨",
    "刘天娇", "胡策亚斌", "亚斌", "柏哥", "王增宇", "王琦", "硕哥", "王宪彬", "刘小龙", "付玉堂",
    # 科协/老师/学长
    "陶老师", "阳老师", "于凡老师", "郜老师", "韩导", "刘导", "栾老师", "侯老师", "蒋老师", "于书记",
    "巨震", "巨震学长", "李鹏辉", "李鹏辉学长", "魏民", "魏民学长", "马赫", "马赫学长",
    "翟", "老翟", "小黑", "陈捷", "茂才", "蒋良茂", "侯家军", "侯长波", "侯哥", "凤博", "凤博学长",
    "旭爷", "达哥", "磊哥", "东东", "刘宇", "卢文正", "李岳朋", "苗磊", "林达", "郭帅", "杨星", "刘强",
    # 工作人物
    "张栋", "陈豪", "陈聪", "健豪", "玉虎", "海洋", "海龙", "温开桥", "马云", "王雨萌",
    "陈林坤", "杨赞伟", "马兵", "马冰", "储星", "黄海燕", "胡晶晶", "李阳", "郭波", "程铮",
    "韩夫伟", "焦建兵", "张良发", "肖瑞", "连升", "韩冰冰", "丁勇", "蔡明星", "陆博", "民锋",
    "李昕", "何涛", "晓明", "高阳", "迎春", "春哥", "独狼", "陈星", "衡骏", "敦华", "垚亮",
    "罗旋", "钰林", "邢军", "璐璐", "徐超", "孙鹏", "志勇", "李诺", "敏聪", "兴鹏", "屈伟",
    "大平", "天鑫", "刘康", "勇宏", "周珍", "李忠锦", "xm", "zz", "yl", "冰泉",
}

CITY_TERMS = {
    "庞口", "高阳", "高阳县", "保定", "保定市", "哈尔滨", "南京", "杭州", "北京", "上海", "深圳",
    "日本", "瑞典", "云南", "西湖", "河北", "广州", "成都", "武汉", "西安", "苏州", "无锡",
    "天津", "香港", "澳门", "重庆", "厦门", "青岛", "宁波", "长沙", "郑州", "海南", "东京",
    "大阪", "京都", "名古屋", "夫子庙", "软件谷", "天隆寺",
}

ORG_TERMS = {
    "科协", "信通科协", "华为", "字节", "阿里", "阿里云", "腾讯", "百度", "中兴", "海思",
    "DataTalks", "Databot", "Sophon", "sophon", "deerflow", "Claude", "claude", "ChatGPT",
    "U2000", "IPMaster", "MDE", "TRIZ", "飞书", "数据平台", "知识中心", "大模型", "多维表格",
    "云启", "活水", "团省委", "工信部", "蓝剑", "军医大",
}

PUBLIC_TERMS = {
    "查理芒格", "芒格", "马斯克", "贝佐斯", "乔布斯", "爱因斯坦", "达尔文", "富兰克林",
    "毛泽东", "邓小平", "秦始皇", "项羽", "刘备", "曹操", "王阳明", "张居正", "斯大林",
}

RELATION_RULES = [
    ("同学", re.compile(r"(?P<name>[一-龥]{1,4})(?:同学|同班|班长|班副)")),
    ("老师", re.compile(r"(?P<name>[一-龥]{1,4})(?:老师|导师)")),
    ("老师", re.compile(r"(?P<name>[一-龥]{1,2})导")),
    ("学长学姐", re.compile(r"(?P<name>[一-龥]{1,4})(?:学长|学姐|师兄|师姐)")),
    ("组织人物", re.compile(r"(?P<name>[一-龥A-Za-z]{1,4})(?:书记|主席|主管|leader|总)")),
]

KNOWN_RELATIONS = {
    "张凡": "同学/早期亲密关系",
    "杨墨": "同学/早期亲密关系",
    "刘天娇": "同学/早期亲密关系",
    "胡策": "同学/朋友",
    "胡哥": "同学/朋友",
    "亚斌": "同学/朋友",
    "柏哥": "同学/朋友",
    "王增宇": "同学/班长",
    "王琦": "同学/科协或就业事务",
    "硕哥": "同学/校园事件见证",
    "王宪彬": "同学/朋友",
    "刘小龙": "学长/同辈网络",
    "付玉堂": "学长/朋友",
    "杨东": "室友/同事",
    "王杰": "室友/同学",
    "鹏宇": "室友/同学",
    "尹鹏宇": "室友/同学",
    "天哥": "室友/同学",
    "神": "室友/同学",
    "于书记": "组织人物/团省委",
    "陶老师": "老师/人生启发",
    "阳老师": "老师/科协与职业支持",
    "于凡老师": "老师/主次判断",
    "郜老师": "老师/实验室导师",
    "韩导": "老师/就业事务",
    "刘导": "老师/校园事务",
    "栾老师": "老师/毕业设计",
    "侯老师": "老师/科协主席传承",
    "蒋老师": "老师/毕业答辩",
    "李鹏辉学长": "学长/技术支持",
    "魏民学长": "学长/技术支持",
    "巨震学长": "学长/能力镜子",
    "苗磊学长": "学长/能力镜子",
    "马赫学长": "学长/生活参照",
    "张贺学长": "学长/生活参照",
}

STOP = {
    "这个", "那个", "一个", "没有", "很多", "自己", "别人", "大家", "老师", "同学", "学长",
    "领导", "主管", "时候", "今天", "以后", "现在", "感觉", "事情", "工作", "大学", "高中",
    "向领", "和领", "和巨震", "皮去和", "和凤博", "支持", "方法", "毕竟侯", "文化和", "安排",
    "和身边", "许多他", "方件", "明领", "高压", "利而", "能领", "能开", "班", "边", "和",
    "和刘",
}

DISPLAY_ALIASES = {
    "胡哥": "胡策",
    "尹鹏宇": "鹏宇",
    "李鹏辉学长": "李鹏辉",
    "魏民学长": "魏民",
    "刘小龙学长": "刘小龙",
    "巨震学长": "巨震",
    "苗磊学长": "苗磊",
    "马赫学长": "马赫",
    "张贺学长": "张贺",
}

NOISY_LINK_PREFIXES = ("20", "19")


def strip_frontmatter(text: str) -> tuple[str, list[str]]:
    tags: list[str] = []
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            fm = text[: end + 5]
            tags = [m.group(1).strip().strip('"') for m in FRONTMATTER_TAG_RE.finditer(fm)]
            return text[end + 5 :], tags
    return text, tags


def wiki_link(path: Path, label: str | None = None) -> str:
    rel = path.relative_to(ROOT).with_suffix("").as_posix()
    return f"[[{rel}|{label or path.stem}]]"


def add(bucket: dict[str, set[str]], category: str, name: str) -> None:
    name = name.strip().strip(" ，。；：:,.!！?？、（）()[]【】")
    if not name or name in STOP or len(name) > 12:
        return
    bucket.setdefault(category, set()).add(name)


def clean_relation_name(name: str) -> str | None:
    name = name.strip()
    while len(name) > 1 and name[0] not in SURNAMES:
        name = name[1:]
    if not name or name in STOP:
        return None
    if name[0] not in SURNAMES:
        return None
    if len(name) < 2:
        return None
    if len(name) > 3:
        return None
    return name


def known_person_in_line(name: str, line: str) -> bool:
    if name == "神":
        return ("[[神]]" in line) or ("室友" in line and "神" in line)
    if len(name) == 1:
        return f"[[{name}]]" in line
    return name in line


def normalize_display_name(name: str) -> str:
    return DISPLAY_ALIASES.get(name, name)


def extract_diary(path: Path) -> tuple[dict[str, set[str]], list[tuple[str, str, int, str]]]:
    text, fm_entities = strip_frontmatter(path.read_text(encoding="utf-8"))
    entities: dict[str, set[str]] = {}
    evidence: list[tuple[str, str, int, str]] = []

    for ent in fm_entities:
        add(entities, "frontmatter实体", ent)

    for line_no, line in enumerate(text.splitlines(), 1):
        raw = line.strip()
        if not raw or raw.startswith("tags:") or raw.startswith("- [[日记索引"):
            continue

        for raw_link, alias in WIKILINK_RE.findall(line):
            label = (alias or Path(raw_link).stem).strip()
            if DATE_LIKE_RE.search(label):
                continue
            add(entities, "wiki链接", label)
            evidence.append(("wiki链接", label, line_no, raw))

        for name in sorted(KNOWN_PEOPLE):
            if known_person_in_line(name, line):
                rel = KNOWN_RELATIONS.get(name, "人物")
                add(entities, rel, name)
                evidence.append((rel, name, line_no, raw))

        for city in sorted(CITY_TERMS):
            if city in line:
                add(entities, "城市地点", city)
                evidence.append(("城市地点", city, line_no, raw))

        for org in sorted(ORG_TERMS):
            if org in line:
                add(entities, "组织项目", org)
                evidence.append(("组织项目", org, line_no, raw))

        for pub in sorted(PUBLIC_TERMS):
            if pub in line:
                add(entities, "公共人物", pub)
                evidence.append(("公共人物", pub, line_no, raw))

        for category, pattern in RELATION_RULES:
            for m in pattern.finditer(line):
                name = clean_relation_name(m.group("name"))
                if not name:
                    continue
                title = "学长" if category == "学长学姐" else ("老师" if category == "老师" else "")
                final_name = name + title
                add(entities, category, final_name)
                evidence.append((category, final_name, line_no, raw))

    return entities, evidence


def render_entity_list(values: set[str], max_items: int = 40) -> str:
    if not values:
        return ""
    items = sorted(values)
    if len(items) > max_items:
        return "、".join(items[:max_items]) + f" 等 {len(items)} 个"
    return "、".join(items)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check or regenerate the detailed diary entity indexes."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--check",
        action="store_true",
        help="Compare generated content without writing (default).",
    )
    mode.add_argument(
        "--write",
        action="store_true",
        help="Atomically update generated indexes when content changed.",
    )
    return parser.parse_args()


def coverage_end(diaries: list[Path]) -> str:
    dates = []
    for path in diaries:
        match = DATE_PREFIX_RE.match(path.stem)
        if not match:
            continue
        try:
            dates.append(
                dt.date(
                    int(match.group("year")),
                    int(match.group("month")),
                    int(match.group("day")),
                )
            )
        except ValueError:
            continue
    return max(dates).isoformat() if dates else "2013-06-02"


def split_document(text: str) -> tuple[str, str]:
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end >= 0:
            return text[: end + 5], text[end + 5 :]
    return "", text


def apply_generated_output(path: Path, content: str, *, write: bool) -> bool:
    current = path.read_text(encoding="utf-8") if path.exists() else None
    generated_frontmatter, generated_body = split_document(content)
    current_frontmatter, current_body = split_document(current or "")
    if current is not None and current_body == generated_body:
        print(f"up_to_date {path.relative_to(ROOT)}")
        return False
    if not write:
        print(f"stale {path.relative_to(ROOT)}")
        return True

    final_content = (current_frontmatter or generated_frontmatter) + generated_body
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(final_content)
        target_mode = (path.stat().st_mode & 0o777) if path.exists() else 0o644
        os.chmod(tmp_name, target_mode)
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise
    print(f"wrote {path.relative_to(ROOT)}")
    return True


def main() -> int:
    args = parse_args()
    diaries = []
    for d in DIARY_DIRS:
        diaries.extend(sorted(p for p in d.glob("*.md") if p.is_file()))

    per_diary = []
    classmate_hits: dict[str, list[tuple[Path, str, int, str]]] = collections.defaultdict(list)
    category_counter: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)

    for path in diaries:
        entities, evidence = extract_diary(path)
        per_diary.append((path, entities, evidence))
        for category in sorted(entities):
            for value in sorted(entities[category]):
                category_counter[category][value] += 1
        for category, name, line_no, line in evidence:
            name = normalize_display_name(name)
            if category.startswith("同学") or category.startswith("室友") or category in {"同学", "学长学姐", "老师"}:
                classmate_hits[name].append((path, category, line_no, line))
            if name in KNOWN_RELATIONS:
                classmate_hits[name].append((path, KNOWN_RELATIONS[name], line_no, line))

    end_date = coverage_end(diaries)
    lines = [
        "---",
        'type: "source_index"',
        "aliases:",
        '  - "逐篇日记实体索引"',
        "tags:",
        '  - "wiki/索引"',
        '  - "来源/wiki"',
        '  - "类型/wiki"',
        '  - "索引/日记"',
        'status: "active"',
        "Start: 2013-06-02",
        f"end: {end_date}",
        "location: []",
        "source:",
        '  - "原始知识库/日记2013-2017"',
        '  - "原始知识库/日记2018-2023"',
        '  - "原始知识库/日记2024至今"',
        "---",
        "# 逐篇日记实体索引",
        "",
        f"本页由 `knowledge-engine/tools/diary_entity_deep_audit.py` 逐篇读取 {len(diaries)} 篇日记生成。它保留每篇日记中可识别的人物、同学/同辈、老师/学长、城市地点、组织项目和公共人物线索，用作后续人工复核与实体合并的证据层。",
        "",
        "## 分类总览",
        "",
        "| 分类 | 实体数 | 高频实体 |",
        "|---|---:|---|",
    ]
    for category in sorted(category_counter):
        counter = category_counter[category]
        top = "、".join(f"{k}({v})" for k, v in counter.most_common(12))
        lines.append(f"| {category} | {len(counter)} | {top} |")

    lines += ["", "## 逐篇索引", ""]
    for path, entities, evidence in per_diary:
        lines.append(f"### {wiki_link(path)}")
        for category in sorted(entities):
            vals = render_entity_list(entities[category])
            if vals:
                lines.append(f"- {category}: {vals}")
        lines.append("")

    c_lines = [
        "---",
        'type: "source_index"',
        "aliases:",
        '  - "同学与同辈实体索引"',
        "tags:",
        '  - "wiki/索引"',
        '  - "来源/wiki"',
        '  - "类型/wiki"',
        '  - "索引/日记"',
        'status: "active"',
        "Start: 2013-06-02",
        f"end: {end_date}",
        "location: []",
        "source:",
        '  - "原始知识库/日记2013-2017"',
        '  - "原始知识库/日记2018-2023"',
        '  - "原始知识库/日记2024至今"',
        "---",
        "# 同学与同辈实体索引",
        "",
        "本页专门收束日记里的同学、室友、学长、老师和校园同辈线索。它用于弥补人物库过去过度偏向亲人、科协和工作人物的问题。",
        "",
        "| 实体 | 关系判断 | 覆盖日记数 | 样例来源 |",
        "|---|---|---:|---|",
    ]
    for name, hits in sorted(classmate_hits.items(), key=lambda kv: (-len({h[0] for h in kv[1]}), kv[0])):
        docs = sorted({h[0] for h in hits}, key=lambda p: p.as_posix())
        relation = KNOWN_RELATIONS.get(name, hits[0][1])
        samples = []
        seen = set()
        for p, category, line_no, line in hits:
            if p in seen:
                continue
            seen.add(p)
            samples.append(f"{wiki_link(p)}:{line_no}")
            if len(samples) >= 4:
                break
        c_lines.append(f"| {name} | {relation} | {len(docs)} | {'；'.join(samples)} |")

    per_diary_changed = apply_generated_output(
        PER_DIARY_OUT, "\n".join(lines), write=args.write
    )
    classmate_changed = apply_generated_output(
        CLASSMATE_OUT, "\n".join(c_lines), write=args.write
    )
    print(f"diaries={len(diaries)}")
    print(f"classmate_entities={len(classmate_hits)}")
    changed = per_diary_changed or classmate_changed
    return 1 if changed and not args.write else 0


if __name__ == "__main__":
    raise SystemExit(main())
