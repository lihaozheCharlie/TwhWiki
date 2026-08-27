#!/usr/bin/env python3
"""Update Obsidian YAML frontmatter properties for the vault."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

from vault_context import KNOWLEDGE_BASE_ROOT


ROOT = KNOWLEDGE_BASE_ROOT
WIKILINK_RE = re.compile(r"\[\[([^\]#|]+)")
LOG_DATE_RE = re.compile(r"^## \[(\d{4}-\d{2}-\d{2})\]", re.MULTILINE)
DATE_TOKEN_RE = re.compile(r"(19\d{2}|20\d{2})[.,-](\d{1,2})[.,-](\d{1,2})")

LINK_TAGS = {
    "日记索引": "索引/日记",
    "读书笔记索引": "索引/读书笔记",
    "历史小记索引": "索引/历史小记",
    "学生阶段": "阶段/学生",
    "华为阶段": "阶段/华为",
    "字节阶段": "阶段/字节",
    "成长故事线总览": "故事线/成长总览",
    "科协故事线": "故事线/科协",
    "恋爱到家庭故事线": "故事线/恋爱到家庭",
    "家庭与代际故事线": "故事线/家庭与代际",
    "注意力与娱乐故事线": "故事线/注意力与娱乐",
    "读书与认知升级故事线": "故事线/读书与认知升级",
    "科协": "实体/科协",
    "翟": "实体/翟命鑫",
    "翟哥": "实体/翟命鑫",
    "老翟": "实体/翟命鑫",
    "才哥": "实体/科协",
    "蒋良茂": "实体/科协",
    "猫粮": "实体/科协",
    "茂才": "实体/科协",
    "小黑": "实体/彭艳华",
    "陈捷": "实体/科协",
    "陈总": "实体/科协",
    "飞哥": "实体/科协",
    "周宗飞": "实体/科协",
    "侯哥": "实体/科协",
    "侯老师": "实体/科协",
    "侯长波": "实体/科协",
    "李岳朋": "实体/科协",
    "苗磊": "实体/科协",
    "林达": "实体/科协",
    "巨震": "实体/科协",
    "巨震学长": "实体/科协",
    "杨星": "实体/科协",
    "刘强": "实体/科协",
    "郭帅": "实体/科协",
    "侯家军": "实体/科协",
    "达哥": "实体/科协",
    "磊哥": "实体/科协",
    "旭爷": "实体/科协",
    "凤博": "实体/科协",
    "凤博学长": "实体/科协",
    "东东": "实体/科协",
    "卢文正": "实体/科协",
    "李鹏辉": "实体/科协",
    "李鹏辉学长": "实体/科协",
    "郜老师": "实体/科协",
    "王增宇": "实体/科协",
    "刘宇": "实体/科协",
    "室友": "实体/室友",
    "王杰": "实体/室友",
    "鹏宇": "实体/尹鹏宇",
    "尹鹏宇": "实体/尹鹏宇",
    "神": "实体/周振宇",
    "周振宇": "实体/周振宇",
    "天哥": "实体/田啸天",
    "啸天": "实体/田啸天",
    "田啸天": "实体/田啸天",
    "U2000": "实体/U2000",
    "玉虎": "实体/U2000",
    "师傅": "实体/U2000",
    "杨赞伟": "实体/U2000",
    "赞伟": "实体/U2000",
    "张栋": "实体/U2000",
    "陈豪": "实体/U2000",
    "陈聪": "实体/U2000",
    "健豪": "实体/U2000",
    "陈林坤": "实体/U2000",
    "林坤": "实体/U2000",
    "海龙": "实体/U2000",
    "海龙哥": "实体/U2000",
    "海洋": "实体/U2000",
    "温开桥": "实体/U2000",
    "温总": "实体/温总",
    "马云": "实体/U2000",
    "王雨萌": "实体/U2000",
    "杨东": "实体/U2000",
    "姚总": "实体/姚总",
    "杨俊灵": "实体/杨俊灵",
    "何有源": "实体/何有源",
    "海思": "实体/海思",
    "马兵": "实体/海思",
    "马冰": "实体/海思",
    "储星": "实体/海思",
    "黄总": "实体/海思",
    "黄海燕": "实体/海思",
    "鑫鑫": "实体/海思",
    "胡晶晶": "实体/海思",
    "李阳": "实体/海思",
    "郭波": "实体/海思",
    "程铮": "实体/海思",
    "韩夫伟": "实体/海思",
    "老焦": "实体/海思",
    "焦建兵": "实体/海思",
    "消费者云服务": "实体/消费者云服务",
    "张良发": "实体/消费者云服务",
    "发哥": "实体/消费者云服务",
    "肖瑞": "实体/消费者云服务",
    "连升": "实体/消费者云服务",
    "连胜": "实体/消费者云服务",
    "冰冰": "实体/消费者云服务",
    "韩冰冰": "实体/消费者云服务",
    "丁勇": "实体/消费者云服务",
    "勇哥": "实体/消费者云服务",
    "蔡明星": "实体/消费者云服务",
    "陆博": "实体/消费者云服务",
    "陆李": "实体/消费者云服务",
    "民锋": "实体/消费者云服务",
    "Databot": "实体/Databot",
    "赵晓明": "实体/赵晓明",
    "晓明": "实体/赵晓明",
    "尹小明": "实体/尹小明",
    "xm": "实体/赵晓明",
    "邹迎春": "实体/邹迎春",
    "春哥": "实体/邹迎春",
    "迎春": "实体/邹迎春",
    "独狼": "实体/邹迎春",
    "付强": "实体/付强",
    "艾玲": "实体/艾玲",
    "keying": "实体/keying",
    "李昕": "实体/李昕",
    "何涛": "实体/何涛",
    "陈星": "实体/Databot",
    "罗旋": "实体/Databot",
    "钰林": "实体/Databot",
    "高阳": "实体/Databot",
    "徐超": "实体/Databot",
    "孙鹏": "实体/Databot",
    "志勇": "实体/Databot",
    "李诺": "实体/Databot",
    "敏聪": "实体/Databot",
    "兴鹏": "实体/Databot",
    "屈伟": "实体/Databot",
    "大平": "实体/Databot",
    "邢军": "实体/Databot",
    "璐璐": "实体/Databot",
    "天鑫": "实体/Databot",
    "大模型项目": "实体/大模型项目",
    "柴柴": "实体/柴柴",
    "猪娘": "实体/柴柴",
    "老婆": "实体/柴柴",
    "张凡": "实体/张凡",
    "zf": "实体/张凡",
    "杨墨": "故事线/恋爱到家庭",
    "刘天娇": "故事线/恋爱到家庭",
    "胡栩策": "实体/胡栩策",
    "胡策": "实体/胡栩策",
    "hxc": "实体/胡栩策",
    "胡哥": "实体/胡栩策",
    "策哥": "实体/胡栩策",
    "刘佳妮": "故事线/恋爱到家庭",
    "女儿": "实体/女儿",
    "母亲": "实体/母亲",
    "南京": "实体/南京",
    "杭州": "实体/杭州",
    "北京": "实体/北京",
    "华为": "实体/华为",
    "字节": "实体/字节",
    "阿里": "实体/阿里",
    "秦始皇": "实体/秦始皇",
    "项羽": "实体/项羽",
    "刘备": "实体/刘备",
    "曹操": "实体/曹操",
    "徐直军": "实体/徐直军",
    "徐总": "实体/徐直军",
    "查理芒格": "实体/查理芒格",
    "自己": "实体/自己",
    "成长": "主题/成长",
    "知行合一": "主题/知行合一",
    "自律": "主题/自律",
    "运动": "主题/运动",
    "健康": "主题/健康",
    "焦虑": "主题/焦虑",
    "冥想": "主题/冥想",
    "职场": "主题/职场",
    "理性": "主题/理性",
    "投资与资产": "主题/投资与资产",
    "家庭": "主题/家庭",
    "读书": "主题/读书",
    "安全感": "主题/安全感",
    "认可需求": "主题/认可需求",
    "边界感": "主题/边界感",
    "责任感": "主题/责任感",
    "选择权": "主题/选择权",
    "表达与争取": "主题/表达与争取",
    "组织与利益结构": "主题/组织与利益结构",
    "长期关系": "主题/长期关系",
    "低谷恢复机制": "主题/低谷恢复机制",
    "决策索引": "索引/决策",
    "阶段复盘索引": "索引/阶段复盘",
    "金句集锦": "索引/金句",
}

LINK_TAGS.update({
    # 亲人
    "父亲": "实体/父亲",
    "爸爸": "实体/父亲",
    "爸": "实体/父亲",
    "我爸": "实体/父亲",
    "奶奶": "实体/奶奶",
    "爷爷": "实体/爷爷",
    "姥姥": "实体/姥姥",
    "姥爷": "实体/姥爷",
    "妹妹": "实体/妹妹",
    "妞妞": "实体/妹妹",
    "小姨": "实体/小姨",
    "小姨夫": "实体/小姨夫",
    "叔叔": "实体/叔叔",
    "老叔": "实体/叔叔",
    "二爷": "实体/二爷",
    "二奶": "实体/二奶",
    "四姑": "实体/四姑",
    "岳父": "实体/岳父",
    "岳母": "实体/岳母",
    "柴柴": "实体/柴柴",
    "猪娘": "实体/柴柴",
    "老婆": "实体/柴柴",
    "女儿": "实体/女儿",
    "母亲": "实体/母亲",
    "自己": "实体/自己",

    # 室友
    "王杰": "实体/王杰",
    "鹏宇": "实体/尹鹏宇",
    "尹鹏宇": "实体/尹鹏宇",
    "逗比": "实体/尹鹏宇",
    "神": "实体/周振宇",
    "周振宇": "实体/周振宇",
    "天哥": "实体/田啸天",
    "啸天": "实体/田啸天",
    "田啸天": "实体/田啸天",

    # 科协
    "翟命鑫": "实体/翟命鑫",
    "翟": "实体/翟命鑫",
    "翟哥": "实体/翟命鑫",
    "老翟": "实体/翟命鑫",
    "才哥": "实体/蒋良茂",
    "蒋良茂": "实体/蒋良茂",
    "猫粮": "实体/蒋良茂",
    "茂才": "实体/蒋良茂",
    "彭艳华": "实体/彭艳华",
    "小黑": "实体/彭艳华",
    "陈捷": "实体/陈捷",
    "陈总": "实体/陈捷",
    "飞哥": "实体/周宗飞",
    "周宗飞": "实体/周宗飞",
    "杨星": "实体/杨星",
    "刘强": "实体/刘强",
    "郭帅": "实体/郭帅",
    "侯家军": "实体/侯家军",
    "卢文正": "实体/卢文正",
    "东东": "实体/东东",
    "刘宇": "实体/刘宇",
    "王增宇": "实体/王增宇",
    "侯哥": "实体/侯长波",
    "侯老师": "实体/侯长波",
    "侯长波": "实体/侯长波",
    "郜老师": "实体/郜老师",
    "李岳朋": "实体/李岳朋",
    "苗磊": "实体/苗磊",
    "林达": "实体/林达",
    "巨震": "实体/巨震",
    "巨震学长": "实体/巨震",
    "李鹏辉": "实体/李鹏辉",
    "李鹏辉学长": "实体/李鹏辉",
    "达哥": "实体/达哥",
    "磊哥": "实体/磊哥",
    "旭爷": "实体/旭爷",
    "凤博": "实体/凤博",
    "凤博学长": "实体/凤博",

    # 华为/U2000/海思/消费者云服务
    "师傅": "实体/杨赞伟",
    "杨赞伟": "实体/杨赞伟",
    "赞伟": "实体/杨赞伟",
    "陈林坤": "实体/陈林坤",
    "林坤": "实体/陈林坤",
    "坤哥": "实体/陈林坤",
    "张栋": "实体/张栋",
    "陈豪": "实体/陈豪",
    "陈聪": "实体/陈聪",
    "健豪": "实体/健豪",
    "玉虎": "实体/玉虎",
    "海洋": "实体/海洋",
    "温开桥": "实体/温开桥",
    "马云": "实体/马云",
    "王雨萌": "实体/王雨萌",
    "海龙": "实体/海龙",
    "海龙哥": "实体/海龙",
    "杨东": "实体/杨东",
    "黄总": "实体/黄海燕",
    "黄海燕": "实体/黄海燕",
    "马兵": "实体/马兵",
    "马冰": "实体/马兵",
    "储星": "实体/储星",
    "chuxing": "实体/储星",
    "老焦": "实体/焦建兵",
    "焦建兵": "实体/焦建兵",
    "胡晶晶": "实体/胡晶晶",
    "李阳": "实体/李阳",
    "鑫鑫": "实体/鑫鑫",
    "郭波": "实体/郭波",
    "程铮": "实体/程铮",
    "韩夫伟": "实体/韩夫伟",
    "丁勇": "实体/丁勇",
    "勇哥": "实体/丁勇",
    "张良发": "实体/张良发",
    "发哥": "实体/张良发",
    "蔡明星": "实体/蔡明星",
    "肖瑞": "实体/肖瑞",
    "连升": "实体/连升",
    "连胜": "实体/连升",
    "冰冰": "实体/韩冰冰",
    "韩冰冰": "实体/韩冰冰",
    "陆博": "实体/陆博",
    "陆李": "实体/陆博",
    "民锋": "实体/民锋",

    # 字节/Databot/大模型
    "赵晓明": "实体/赵晓明",
    "晓明": "实体/赵晓明",
    "尹小明": "实体/尹小明",
    "xm": "实体/赵晓明",
    "李昕": "实体/李昕",
    "何涛": "实体/何涛",
    "高阳": "实体/高阳",
    "邹迎春": "实体/邹迎春",
    "春哥": "实体/邹迎春",
    "迎春": "实体/邹迎春",
    "独狼": "实体/邹迎春",
    "付强": "实体/付强",
    "艾玲": "实体/艾玲",
    "keying": "实体/keying",
    "陈星": "实体/陈星",
    "cx": "实体/陈星",
    "罗旋": "实体/罗旋",
    "罗璇": "实体/罗旋",
    "钰林": "实体/钰林",
    "yulin": "实体/钰林",
    "邢军": "实体/邢军",
    "璐璐": "实体/璐璐",
    "徐超": "实体/徐超",
    "孙鹏": "实体/孙鹏",
    "志勇": "实体/志勇",
    "李诺": "实体/李诺",
    "敏聪": "实体/敏聪",
    "兴鹏": "实体/兴鹏",
    "屈伟": "实体/屈伟",
    "大平": "实体/大平",
    "天鑫": "实体/天鑫",
    "刘康": "实体/刘康",
    "勇宏": "实体/勇宏",
    "周珍": "实体/周珍",
    "zz": "实体/周珍",
    "阿珍": "实体/周珍",
    "陈垚亮": "实体/陈垚亮",
    "垚亮": "实体/陈垚亮",
    "yaoliang": "实体/陈垚亮",
    "yl": "实体/陈垚亮",
    "李忠锦": "实体/李忠锦",
    "陈长柏": "实体/陈长柏",
    "长柏": "实体/陈长柏",
    "柏哥": "实体/陈长柏",
    "张晨硕": "实体/张晨硕",
    "硕哥": "实体/张晨硕",
    "屈向阳": "实体/屈向阳",
    "大屈": "实体/屈向阳",
    "李同欢": "实体/李同欢",
    "老牛": "实体/李同欢",
    "王奥": "实体/王奥",
    "王傲": "实体/王奥",
    "魏庆": "实体/魏庆",
    "齐鹏": "实体/齐鹏",
    "李劲": "实体/李劲",
    "劲熊": "实体/李劲",
    "闫章涵": "实体/闫章涵",
    "秦玉东": "实体/秦玉东",
    "B哥": "实体/秦玉东",
    "刘佳妮": "实体/刘佳妮",
})

MANAGED_PREFIXES = (
    "主题/",
    "实体/",
    "故事线/",
    "阶段/",
    "索引/",
    "来源/",
    "类型/",
    "日记/",
    "wiki/",
    "时间线/",
    "决策/",
    "复盘/",
    "追踪/",
)

MANAGED_PROPERTIES = {
    "type",
    "aliases",
    "tags",
    "status",
    "Start",
    "end",
    "location",
    "source",
}

GLOBAL_RANGE = ("2013-06-02", "2026-05-04")
STAGE_RANGES = {
    "学生阶段": ("2013-06-02", "2017-06-15"),
    "华为阶段": ("2017-07-17", "2022-01-19"),
    "字节阶段": ("2022-02-08", "2026-04-28"),
    "科协": ("2013-06-02", "2017-06-15"),
    "室友": ("2013-06-02", "2017-06-15"),
    "华为": ("2017-07-17", "2022-01-19"),
    "U2000": ("2017-07-17", "2022-01-19"),
    "海思": ("2017-07-17", "2022-01-19"),
    "消费者云服务": ("2017-07-17", "2022-01-19"),
    "字节": ("2022-02-08", "2026-04-28"),
    "Databot": ("2022-02-08", "2026-04-28"),
    "大模型项目": ("2023-06-19", "2026-04-28"),
}
CITY_NAMES = {"庞口", "高阳县", "保定市", "哈尔滨", "南京", "杭州", "北京"}


def all_markdown_files() -> list[Path]:
    skipped = {".obsidian", ".idea"}
    return sorted(
        p
        for p in ROOT.rglob("*.md")
        if not any(part in skipped for part in p.relative_to(ROOT).parts)
    )


def split_frontmatter(text: str) -> tuple[list[str], str]:
    if not text.startswith("---\n"):
        return [], text
    end = text.find("\n---\n", 4)
    if end == -1:
        return [], text
    frontmatter = text[4:end].splitlines()
    body = text[end + len("\n---\n") :]
    return frontmatter, body


def parse_frontmatter(frontmatter: list[str]) -> tuple[dict[str, object], list[str]]:
    data: dict[str, object] = {}
    kept: list[str] = []
    i = 0
    while i < len(frontmatter):
        line = frontmatter[i]
        stripped = line.strip()
        for key in ("aliases", "tags", "location", "source"):
            if stripped == f"{key}: []":
                data[key] = []
                i += 1
                break
        else:
            key = None
        if key is not None:
            continue
        if stripped in {"aliases:", "tags:", "location:", "source:"}:
            key = stripped[:-1]
            values: list[str] = []
            i += 1
            while i < len(frontmatter) and frontmatter[i].startswith("  - "):
                value = frontmatter[i][4:].strip().strip("'\"")
                if value:
                    values.append(value)
                i += 1
            data[key] = values
            continue
        if ": " in line or stripped.endswith(":"):
            key, _, value = line.partition(":")
            key = key.strip()
            if key in MANAGED_PROPERTIES:
                cleaned = value.strip().strip("'\"")
                if cleaned:
                    data[key] = cleaned
                i += 1
                continue
        kept.append(line)
        i += 1
    return data, kept


def tag_from_wikilink(target: str) -> str | None:
    normalized = target.split("/")[-1]
    return LINK_TAGS.get(normalized)


def tags_from_links(text: str) -> set[str]:
    tags: set[str] = set()
    for match in WIKILINK_RE.finditer(text):
        tag = tag_from_wikilink(match.group(1).strip())
        if tag:
            tags.add(tag)
    return tags


def tags_from_path(path: Path) -> set[str]:
    rel = path.relative_to(ROOT)
    parts = rel.parts
    tags: set[str] = set()

    if parts[0] == "原始知识库":
        tags.add("来源/原始知识库")
        if len(parts) > 1:
            folder = parts[1]
            if folder.startswith("日记"):
                tags.add("类型/日记")
                tags.add(f"日记/{folder.removeprefix('日记')}")
            elif folder == "读书笔记":
                tags.update({"类型/读书笔记", "主题/读书"})
            elif folder == "历史小记":
                tags.update({"类型/历史小记", "主题/历史"})
    elif parts[0] == "wiki":
        tags.update({"来源/wiki", "类型/wiki"})
        if len(parts) == 1:
            return tags
        if len(parts) == 2:
            name = path.stem
            if name == "index":
                tags.add("类型/入口")
            elif name == "log":
                tags.add("类型/日志")
            elif name in {"维护手册", "AGENTS"}:
                tags.add("类型/维护")
        elif parts[1] == "07 人物与城市":
            tags.update({"wiki/实体", f"实体/{path.stem}"})
        elif parts[1] == "08 来源索引":
            tags.update({"wiki/索引", f"索引/{path.stem.replace('索引', '')}"})
        elif parts[1] == "10 时间线":
            tags.update({"wiki/时间线", f"时间线/{path.stem}"})
        elif parts[1] == "03 关键事件与决策":
            if path.stem == "决策索引":
                tags.update({"wiki/事件", "wiki/决策", "wiki/索引", "索引/决策"})
            elif path.stem == "关键事件与决策总览":
                tags.update({"wiki/事件", "wiki/决策", "wiki/索引", "索引/关键事件"})
            elif path.stem == "00 重要事件总览":
                tags.update({"wiki/事件", "wiki/索引", "索引/重要事件"})
            elif path.stem == "16 提前布局海外资产":
                tags.update({"wiki/事件", "wiki/决策", "类型/事件", "类型/决策", "决策/提前布局海外资产"})
            elif re.match(r"^\d+\s+", path.stem):
                tags.update({"wiki/事件", "类型/事件"})
            else:
                tags.update({"wiki/事件", "wiki/决策", "类型/决策", f"决策/{path.stem}"})
        elif parts[1] == "decisions":
            if path.stem == "决策索引":
                tags.update({"wiki/决策", "wiki/索引", "索引/决策"})
            else:
                tags.update({"wiki/决策", "类型/决策", f"决策/{path.stem}"})
        elif parts[1] == "reviews":
            if path.stem == "阶段复盘索引":
                tags.update({"wiki/复盘", "wiki/索引", "索引/阶段复盘"})
            else:
                tags.update({"wiki/复盘", "类型/阶段复盘", f"复盘/{path.stem}"})
        elif parts[1] == "09 思维模型":
            if path.stem == "思维模型总览":
                tags.update({"wiki/思维模型", "wiki/索引", "索引/思维模型"})
            else:
                tags.update({"wiki/思维模型", "类型/思维模型", f"思维模型/{path.stem}"})
        elif parts[1] == "11 状态追踪":
            if path.stem == "状态追踪总览":
                tags.update({"wiki/状态追踪", "wiki/索引", "索引/状态追踪"})
            else:
                tags.update({"wiki/状态追踪", "类型/状态追踪", f"追踪/{path.stem}"})
        elif parts[1] == "13 金句集锦":
            tags.update({"wiki/金句集锦", "wiki/索引", "索引/金句"})
        elif parts[1] == "00 总入口":
            tags.update({"wiki/个人操作系统", "类型/入口"})
        elif parts[1] == "01 个人主线":
            tags.update({"wiki/个人主线", f"主线/{path.stem}"})
        elif parts[1] == "02 人生阶段":
            tags.update({"wiki/人生阶段", f"人生阶段/{path.stem}"})
        elif parts[1] == "04 反复循环":
            tags.update({"wiki/反复循环", f"循环/{path.stem}"})
        elif parts[1] == "05 人物关系图谱":
            tags.update({"wiki/人物图谱", f"人物图谱/{path.stem}"})
        elif parts[1] == "06 现实系统":
            tags.update({"wiki/现实系统", f"系统/{path.stem}"})
        elif parts[1] == "99 维护规则":
            tags.update({"类型/维护", "wiki/维护"})
    elif path.name == "llm-wiki.md":
        tags.update({"类型/说明", "来源/wiki"})
    elif path.name == "欢迎.md":
        tags.add("类型/入口")
    return tags


def yaml_quote(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def strip_event_prefix(name: str) -> str:
    return re.sub(r"^\d+\s+", "", name)


def basename_from_target(target: str) -> str:
    normalized = target.replace("\\", "/").rstrip("/")
    return normalized.split("/")[-1]


def normalize_raw_target(target: str) -> str | None:
    normalized = target.replace("\\", "/")
    if "原始知识库/" not in normalized:
        return None
    return normalized[normalized.index("原始知识库/") :].rstrip("/")


def extract_dates_from_text(text: str) -> list[str]:
    dates: list[str] = []
    for year, month, day in DATE_TOKEN_RE.findall(text):
        dates.append(f"{int(year):04d}-{int(month):02d}-{int(day):02d}")
    return dates


def extract_raw_sources(body: str) -> list[str]:
    seen: set[str] = set()
    sources: list[str] = []
    for match in WIKILINK_RE.finditer(body):
        target = match.group(1).strip()
        normalized = normalize_raw_target(target)
        if normalized and normalized not in seen:
            seen.add(normalized)
            sources.append(normalized)
    return sources


def extract_stage_range_from_body(body: str) -> tuple[str, str] | None:
    names = [basename_from_target(match.group(1).strip()) for match in WIKILINK_RE.finditer(body)]
    for name in names:
        if name in STAGE_RANGES:
            return STAGE_RANGES[name]
    return None


def extract_locations(path: Path, body: str) -> list[str]:
    rel = path.relative_to(ROOT)
    if len(rel.parts) > 2 and rel.parts[:3] == ("wiki", "07 人物与城市", "生活过的城市"):
        if path.stem.endswith("总览"):
            return []
        return [strip_event_prefix(path.stem)]
    seen: set[str] = set()
    locations: list[str] = []
    for match in WIKILINK_RE.finditer(body):
        name = basename_from_target(match.group(1).strip())
        if name in CITY_NAMES and name not in seen:
            seen.add(name)
            locations.append(name)
    return locations


def extract_aliases_from_body(body: str) -> list[str]:
    match = re.search(r"^## 别名\s*$\n([\s\S]*?)(?=^## |\Z)", body, re.MULTILINE)
    if not match:
        return []
    block = match.group(1)
    raw = " ".join(line.strip().lstrip("-").strip() for line in block.splitlines() if line.strip())
    if not raw:
        return []
    parts = re.split(r"[\/、，,]|(?:\s+-\s+)|\s{2,}", raw)
    aliases: list[str] = []
    seen: set[str] = set()
    for part in parts:
        cleaned = part.strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            aliases.append(cleaned)
    return aliases


def derive_type(path: Path) -> str:
    rel = path.relative_to(ROOT)
    if rel.parts[0] != "wiki":
        return "note"
    if len(rel.parts) == 2:
        if path.stem == "index":
            return "index"
        if path.stem == "log":
            return "log"
        if path.stem in {"维护手册", "AGENTS"}:
            return "guide"
        return "wiki"
    section = rel.parts[1]
    if section == "03 关键事件与决策":
        if path.stem == "关键事件与决策总览":
            return "event_index"
        if path.stem == "决策索引":
            return "decision_index"
        if path.stem == "00 重要事件总览":
            return "event_index"
        if path.stem == "16 提前布局海外资产":
            return "event"
        if re.match(r"^\d+\s+", path.stem):
            return "event"
        return "decision"
    return {
        "07 人物与城市": "entity",
        "08 来源索引": "source_index",
        "10 时间线": "timeline",
        "03 关键事件与决策": "event",
        "decisions": "decision_index" if path.stem == "决策索引" else "decision",
        "reviews": "review_index" if path.stem == "阶段复盘索引" else "review",
        "09 思维模型": "mental_model_index" if path.stem == "思维模型总览" else "mental_model",
        "11 状态追踪": "tracking_index" if path.stem == "状态追踪总览" else "tracking_template",
        "13 金句集锦": "quote_index",
    }.get(section, "wiki")


def derive_aliases(path: Path, body: str, existing: Iterable[str]) -> list[str]:
    aliases: list[str] = []
    seen: set[str] = set()
    for alias in existing:
        if alias and alias not in seen:
            seen.add(alias)
            aliases.append(alias)
    for alias in extract_aliases_from_body(body):
        if alias not in seen:
            seen.add(alias)
            aliases.append(alias)
    stripped = strip_event_prefix(path.stem)
    if stripped != path.stem and stripped not in seen:
        aliases.insert(0, stripped)
    return aliases


def derive_status(path: Path, body: str, raw_sources: list[str]) -> str:
    rel = path.relative_to(ROOT)
    if rel.parts[0] != "wiki":
        return "active"
    if path.stem in {"index", "log", "维护手册", "AGENTS"}:
        return "active"
    if rel.parts[0] == "wiki" and path.stem.endswith("总览"):
        return "active"
    if rel.parts[1] == "07 人物与城市" and re.search(r"\d+ 篇原始日记", body) and "未发现" in body:
        return "active"
    seed_markers = (
        "当前主要依据现有 wiki 聚合页",
        "后续遇到新的原始日记证据再补",
        "后续遇到更多材料再补细节",
        "现有材料还不足以展开",
    )
    if any(marker in body for marker in seed_markers):
        return "seed"
    if rel.parts[1] == "07 人物与城市" and not raw_sources:
        return "seed"
    return "active"


def derive_start_end(
    path: Path,
    body: str,
    raw_sources: list[str],
    existing_start: object | None = None,
    existing_end: object | None = None,
) -> tuple[str, str]:
    def existing_range() -> tuple[str, str] | None:
        if isinstance(existing_start, str) and isinstance(existing_end, str):
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", existing_start) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", existing_end):
                return existing_start, existing_end
        return None

    raw_dates: list[str] = []
    for source in raw_sources:
        raw_dates.extend(extract_dates_from_text(source))
    rel = path.relative_to(ROOT)
    if len(rel.parts) > 1 and rel.parts[1] == "13 金句集锦":
        date_candidates = list(raw_dates)
        existing = existing_range()
        if existing:
            date_candidates.extend(existing)
        if date_candidates:
            return min(date_candidates), max(date_candidates)
    if raw_dates:
        return min(raw_dates), max(raw_dates)
    if path.stem == "log":
        log_dates = LOG_DATE_RE.findall(body)
        if log_dates:
            return min(log_dates), max(log_dates)
    if path.stem in {"index", "维护手册", "AGENTS"}:
        return existing_range() or GLOBAL_RANGE
    if len(rel.parts) > 1 and rel.parts[1] in {"08 来源索引", "10 时间线", "03 关键事件与决策", "decisions", "reviews", "09 思维模型", "11 状态追踪"}:
        stage_range = extract_stage_range_from_body(body)
        return stage_range or existing_range() or GLOBAL_RANGE
    stage_range = extract_stage_range_from_body(body)
    if stage_range:
        return stage_range
    return existing_range() or GLOBAL_RANGE


def derive_source(path: Path, body: str, raw_sources: list[str]) -> list[str]:
    rel = path.relative_to(ROOT)
    if len(rel.parts) > 1 and rel.parts[1] == "13 金句集锦":
        sources = list(raw_sources)
        if "wiki/08 来源索引/对话分析索引" in body:
            sources.append("wiki/08 来源索引/对话分析索引")
        if "2026-07-19" in body:
            sources.append("user dialogue 2026-07-19")
        sources.append("wiki synthesis")
        return sources
    if raw_sources:
        return raw_sources
    if path.stem == "log":
        return ["wiki/log.md"]
    return ["wiki synthesis"]


def render_scalar(key: str, value: str) -> list[str]:
    if key in {"Start", "end"} and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return [f"{key}: {value}"]
    return [f"{key}: {yaml_quote(value)}"]


def render_list(key: str, values: list[str]) -> list[str]:
    if not values:
        return [f"{key}: []"]
    lines = [f"{key}:"]
    for value in values:
        lines.append(f"  - {yaml_quote(value)}")
    return lines


def render_wiki_frontmatter(extra_lines: list[str], props: dict[str, object]) -> str:
    lines: list[str] = []
    lines.extend(render_scalar("type", str(props["type"])))
    lines.extend(render_list("aliases", list(props["aliases"])))
    lines.extend(render_list("tags", list(props["tags"])))
    lines.extend(render_scalar("status", str(props["status"])))
    lines.extend(render_scalar("Start", str(props["Start"])))
    lines.extend(render_scalar("end", str(props["end"])))
    lines.extend(render_list("location", list(props["location"])))
    lines.extend(render_list("source", list(props["source"])))
    extra = [line for line in extra_lines if line.strip()]
    if extra:
        lines.append("")
        lines.extend(extra)
    return "---\n" + "\n".join(lines) + "\n---\n"


def render_raw_frontmatter(frontmatter: list[str], tags: set[str]) -> str:
    lines = list(frontmatter)
    while lines and lines[-1] == "":
        lines.pop()
    if lines and lines[-1] != "":
        lines.append("")
    lines.append("tags:")
    for tag in sorted(tags):
        lines.append(f"  - {tag}")
    return "---\n" + "\n".join(lines) + "\n---\n"


def update_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="replace")
    frontmatter, body = split_frontmatter(text)
    existing_data, kept_frontmatter = parse_frontmatter(frontmatter)
    existing_tags = set(existing_data.get("tags", []))
    custom_tags = {tag for tag in existing_tags if not tag.startswith(MANAGED_PREFIXES)}
    tags = custom_tags | tags_from_path(path)
    rel = path.relative_to(ROOT)
    if rel.parts[0] == "原始知识库":
        tags |= tags_from_links(body)
    if not tags:
        return False
    if rel.parts[0] == "wiki":
        raw_sources = extract_raw_sources(body)
        start, end = derive_start_end(path, body, raw_sources, existing_data.get("Start"), existing_data.get("end"))
        props = {
            "type": derive_type(path),
            "aliases": derive_aliases(path, body, existing_data.get("aliases", [])),
            "tags": sorted(tags),
            "status": derive_status(path, body, raw_sources),
            "Start": start,
            "end": end,
            "location": extract_locations(path, body),
            "source": derive_source(path, body, raw_sources),
        }
        new_text = render_wiki_frontmatter(kept_frontmatter, props) + body
    else:
        new_text = render_raw_frontmatter(kept_frontmatter, tags) + body
    if new_text == text:
        return False
    path.write_text(new_text, encoding="utf-8")
    return True


def main() -> None:
    changed = 0
    files = all_markdown_files()
    for path in files:
        if update_file(path):
            changed += 1
    print(f"updated={changed} scanned={len(files)}")


if __name__ == "__main__":
    main()
