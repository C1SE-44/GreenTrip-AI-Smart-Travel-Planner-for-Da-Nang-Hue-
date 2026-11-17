"""Bounded search turns with explicit counts and food evidence, also usable offline."""
import re
from copy import deepcopy
from app.assistant import search


NUMBERS = {'mot':1,'hai':2,'ba':3,'bon':4,'nam':5,'sau':6,'bay':7,'tam':8,'chin':9,'muoi':10}

def quantity(value):
    return int(value) if value.isdigit() else NUMBERS[value]


def named_quantities(text):
    aliases = {search.fold(name):category for category,names in search.ALIASES.items() for name in names}
    names = '|'.join(re.escape(name) for name in sorted(aliases,key=len,reverse=True))
    numbers = r'\d+|' + '|'.join(NUMBERS)
    pattern = r'\b(' + numbers + r')\s+(?:(?:dia diem|diem|noi|quan|ngoi|tiem)\s+)?(?:(?:la|di)\s+)*(' + names + r')\b'
    return [(match.start(),aliases[match[2]],quantity(match[1])) for match in re.finditer(pattern,text)]


def understand(message, state, destination):
    text = search.fold(message)
    # These are compositional clauses, not exact-message responses.
    if not re.search(r'\b(?:luu|ap dung|xep lich|ngay\s*\d+)\b', text):
        excluded = []
        for category, names in search.ALIASES.items():
            if any(re.search(r'\b(?:khong|dung)(?: ghe| di| goi y| den| chon)*\s+' + re.escape(name), text) for name in names):
                excluded.append(category)
        light = bool(re.search(r'\b(?:nhe nhang|di nhe|it di bo)\b', text))
        local = 'mon dia phuong' in text or 'am thuc dia phuong' in text
        if excluded and (light or local):
            city = search.explicit_city(message) or state.get('criteria', {}).get('city') or destination
            filters = {'city': city, 'excluded_category': excluded, 'result_count': 3, 'preferences': {'quiet': light}}
            return {'filters': filters, 'append': False, 'light': light, 'local_food': local}

    count = re.search(r'\b(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s+(?:dia diem|diem|noi|quan|chua|bao tang)\b', text)
    extra = re.search(r'\b(?:them|bo sung)\s+(\d+|mot|hai)\s+(chua|bao tang|quan ca phe|quan an)', text)
    dish = re.search(r'\b(?:muon an|tim quan (?:ban|co)|an mon)\s+(.+?)(?=\s+(?:o|tai|duoi|gan|thi|co (?:quan|cho)|(?:quan|cho) nao|giup|nhe)\b|[,.!?]|$)', text)
    if not dish:
        # Clear food nouns allow direct questions; arbitrary dish names still use explicit eating/selling verbs.
        dish = re.search(r'\b(?:(?:tim|goi y)\s+|(?:co\s+)?quan nao (?:ban|co|phuc vu)\s+)?((?:mi|my|bun|banh|com|chao|pho|cao lau|goi(?!\s+y\b)|lau|che)\s+.+?)(?=\s+(?:o|tai|duoi|gan|thi|co quan|quan nao|giup|nhe)\b|[,.!?]|$)', text)
    previous = state.get('criteria', {})
    city_switch = search.explicit_city(message)
    if previous.get('dish') and city_switch and re.fullmatch(r'(?:(?:con|the|vay)\s+)?(?:(?:o|tai|sang|chuyen sang|doi sang)\s+)?(?:da nang|danang|hue)(?:\s+(?:thi sao|co khong|co quan nao|nhe))?[ ?!.]*', text):
        filters = deepcopy(previous)
        filters['city'] = city_switch
        return {'filters': filters, 'append': False}

    if any(word in text for word in ("con lai", "thay the", "khong", "dung", "loai tru")) and not dish:
        return None
    simple_category = search.criteria(message).get("category")
    fresh_search = bool(simple_category and re.search(r"\b(?:tim|muon|goi y|gioi thieu)\b", text))
    if not (count or extra or dish or fresh_search):
        return None
    if any(word in text for word in ('vao lich', 'vao y tuong', 'ngay ', 'luu ', 'len ke hoach', 'lap lich', 'tao lich', 'xep lich', 'len lich')):
        return None
    city = search.explicit_city(message) or state.get('criteria', {}).get('city') or destination
    filters = search.criteria(message, {}, city)
    filters['city'] = city
    filters['result_count'] = 5
    filters['high_rating'] = bool(re.search(r'danh gia cao|rating cao|tot nhat', text))
    if extra:
        filters = search.criteria(message, deepcopy(state.get('criteria', {})), city)
        filters.pop('mix', None)
        filters['result_count'] = {'mot': 1, 'hai': 2}.get(extra[1], int(extra[1]) if extra[1].isdigit() else 1)
        filters['omit_ids'] = list(dict.fromkeys(state.get('seen_ids', []) + state.get('last_ids', [])))
    elif count:
        filters['result_count'] = int(count[1]) if count[1].isdigit() else {'mot':1,'hai':2,'ba':3,'bon':4,'nam':5,'sau':6,'bay':7,'tam':8,'chin':9,'muoi':10}[count[1]]
        groups = named_quantities(text)
        if groups:
            quotas = {}
            for _, category, amount in groups:
                quotas[category] = quotas.get(category,0) + amount
            explicit_total = all(start != count.start() for start, _, _ in groups)
            total = filters['result_count'] if explicit_total else sum(quotas.values())
            if sum(quotas.values()) > total:
                return {'question': 'Số điểm của các nhóm đang lớn hơn tổng số điểm. Bạn muốn tổng cộng bao nhiêu điểm?'}
            filters['result_count'] = total
            if len(quotas)>1 or explicit_total:
                filters.pop('category',None)
                filters['mix'] = quotas | ({'other':total-sum(quotas.values())} if explicit_total else {})
    if not 1 <= filters.get('result_count', 5) <= 50:
        return {'question': 'Bạn chọn từ 1 đến 50 điểm cho lượt gợi ý này nhé.'}
    if dish:
        filters = {'city': city, 'category': 'food', 'dish': re.sub(r'\s+(?:(?:ngon|khac|nao|khong|phu hop)\s*)+$', '', dish[1].strip()), 'result_count': filters.get('result_count', 5)}
        if re.search(r'\bkhac\b', text):
            filters['omit_ids'] = list(state.get('seen_ids', []))
    return {'filters': filters, 'append': bool(extra)}


def respond(turn, state, preferences):
    if turn.get('question'):
        return {'text': turn['question'], 'pois': [], 'prompts': []}
    filters = turn['filters']
    points, _, _ = search.search(filters, preferences)
    selected = search.select_results(points, filters)
    cards = [search.card(p) for p in selected]
    city = filters.get('city') or 'khu vực đã chọn'
    heading = f"Mình gợi ý {'thêm ' if turn['append'] else ''}{len(cards)} điểm ở {city}."
    quotas = filters.get('mix', {})
    labels = {'cafe':'quán cà phê','temple':'chùa','museum':'bảo tàng','church':'nhà thờ','spiritual':'điểm tâm linh','nature':'điểm thiên nhiên','food':'quán ăn','other':'điểm khác'}
    actual = {}
    assigned = set()
    for category, wanted in quotas.items():
        if category == 'other': continue
        matches = [p for p in selected if p['id'] not in assigned and search.category_match(p,category)][:wanted]
        actual[category] = len(matches)
        assigned.update(p['id'] for p in matches)
    if 'other' in quotas: actual['other'] = len(selected)-len(assigned)
    if quotas:
        heading += ' Gồm ' + ', '.join(f"{actual.get(category,0)} {labels[category]}" for category in quotas) + '.'
        short = [f"{wanted-actual.get(category,0)} {labels[category]}" for category,wanted in quotas.items() if wanted>actual.get(category,0)]
        if short: heading += ' Chưa tìm đủ ' + ', '.join(short) + ' trong dữ liệu khớp yêu cầu.'
    if turn['append']:
        heading += ' Các điểm trước vẫn được giữ trong hội thoại.'
    if filters.get('dish'):
        heading = f"Mình tìm quán có thông tin xác nhận món {filters['dish']} ở {city}."
        for card in cards:
            card['price_label'] = 'Chưa xác nhận giá riêng của món'
    if len(cards) < filters.get('result_count', 5):
        heading += f" Dữ liệu hiện chỉ xác nhận được {len(cards)} điểm khớp yêu cầu."
    if turn.get('light'):
        heading += ' Mình ưu tiên nơi có dữ liệu yên tĩnh; chưa xác nhận mức đi bộ hay khả năng tiếp cận.'
    if filters.get('excluded_category'):
        heading += ' Đã loại loại địa điểm bạn không muốn ghé.'
    if turn.get('local_food'):
        heading += ' Phần món địa phương cần tìm riêng để kiểm tra thông tin món.'
    lines = [f"**{p['name']}** — {search.reason_for(p, filters)}" for p in selected]
    state['criteria'] = filters
    state['last_ids'] = [p['id'] for p in cards]
    state['last_results'] = cards
    state['seen_ids'] = list(dict.fromkeys(state.get('seen_ids', []) + state['last_ids']))[-400:]
    prompts = []
    if cards and filters.get('category') == 'temple':
        prompts = [{'label': 'Thêm một chùa', 'message': f'Gợi ý thêm 1 chùa nữa ở {city}'}]
    elif cards and filters.get('mix', {}).get('temple'):
        prompts = [{'label': 'Thêm một chùa', 'message': f'Gợi ý thêm 1 chùa nữa ở {city}'}]
    elif cards and filters.get('dish'):
        prompts = [{'label': 'Tìm quán khác', 'message': f'Tìm quán có {filters["dish"]} khác ở {city}'}]
    if turn.get('local_food'):
        prompts = [{'label': 'Tìm món địa phương', 'message': f'Tìm 3 điểm quán ăn ở {city}'}]
    return {'text': heading + ('\n' + '\n'.join(lines) if lines else ''), 'pois': cards, 'prompts': prompts}
