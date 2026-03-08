window.addEventListener('load', function () {

  /* ─────────────────────────────────────────────
     Data
     ───────────────────────────────────────────── */
  const FIELDS = [
    'All fields', 'Title', 'Person', 'Place', 'RISM / VD16 / Brown ID',
    'Description / Comment', 'Bibliography'
  ];

  // Dynamic persons list - populated from data
  let DYNAMIC_PERSONS = [];

  // Dynamic places list - populated from data
  let DYNAMIC_PLACES = [];

  // Dynamic shelfmarks list - populated from data
  let DYNAMIC_SHELFMARKS = [];

  const FUNCTIONS_DATA = [
    'broadsheet / Einblattdruck', 'leaflet / Liedflugschrift', 'part book / Stimmbuch',
    "primer, teacher's book", 'song book / Liederbuch', 'student handbook', 'tablature book',
    { label: '[empty field]', cls: 'sm-chip--grey' }
  ];

  const PHYS_RADIO_VALUES  = ['Both', 'Print', 'Manuscript'];
  const FUNDA_RADIO_VALUES = ['Both', 'Yes', 'No'];

  /* ─────────────────────────────────────────────
     Icons
     ───────────────────────────────────────────── */
  const SVG_CHEVRON = '<svg class="phys-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  const SVG_X    = feather.icons['x'].toSvg({ width: 13, height: 13, 'stroke-width': 2 });
  const SVG_PLUS = feather.icons['plus'].toSvg({ width: 13, height: 13, 'stroke-width': 3 });

  document.getElementById('searchIconBtn').innerHTML =
    feather.icons['search'].toSvg({ width: 17, height: 17, 'stroke-width': 2 });

  document.querySelectorAll('#searchDropdown .add-btn').forEach(btn => {
    btn.innerHTML = SVG_PLUS + ' Add field';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '6px';
  });

  /* ─────────────────────────────────────────────
     Shared state
     ───────────────────────────────────────────── */
  const manuallyHiddenContent = new Set();
  let isManualToggle   = false;
  let table;                     // set after fetch → DataTable init
  let isExpandAllActive = false;
  let isDescCommentsOpen = false;

  /* ─────────────────────────────────────────────
     Shared utilities
     ───────────────────────────────────────────── */



  // Escape regex special characters
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Normalize to array
  function toArray(val) {
    return Array.isArray(val) ? val : [val];
  }

  // Mark that a manual change occurred to prevent unwanted expand-all behavior
  function markManualChange() {
    isManualToggle = true;
  }

  // Mark manual change and redraw table
  function redrawTable() {
    markManualChange();
    if (table) table.draw();
  }

  // Escape HTML entities
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Strip HTML tags, return plain text
  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  // Recursively extract text from any value (string, number, array, object)
  function extractText(val) {
    if (!val) return '';
    if (typeof val === 'string') return stripHtml(val);
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val)) return val.map(v => extractText(v)).join(' ');
    if (typeof val === 'object') {
      const parts = [];
      if (val.label)        parts.push(stripHtml(val.label));
      if (val.description)  parts.push(stripHtml(val.description));
      if (val.comment)      parts.push(stripHtml(val.comment));
      if (val.bookShort)    parts.push(stripHtml(val.bookShort));
      if (val.referenceSource && val.referenceSource.bookShort)
        parts.push(stripHtml(val.referenceSource.bookShort));
      if (val.referencePages) parts.push(stripHtml(val.referencePages));
      return parts.join(' ');
    }
    return '';
  }

  function updateChevron($element, isExpanded) {
    $element.attr('data-feather', isExpanded ? 'chevron-down' : 'chevron-right');
  }

  function getTypeSuffix(type) { return type === 'description' ? 'desc' : 'comm'; }

  function getFirstLabel(index, labelText) { return index === 0 ? labelText : ''; }

  function getColumnWidths() {
    const widths = [];
    const $firstRow = $('#sourcesTable tbody tr:not(.child):first td');
    if ($firstRow.length > 0) {
      $firstRow.slice(0, 3).each(function() { widths.push($(this).outerWidth() + 'px'); });
    } else {
      $('#sourcesTable thead th').slice(0, 3).each(function() { widths.push($(this).outerWidth() + 'px'); });
    }
    return widths;
  }

  function applyCdExpandedClass($table) {
    $table.find('tbody tr').each(function() {
      const $row = $(this);
      $row.toggleClass('cd-expanded', $row.find('.CD-content:visible').length > 0);
    });
  }

  /* ─────────────────────────────────────────────
     Umlaut pattern helpers (two distinct uses)
     ───────────────────────────────────────────── */

  // Used by highlightText (raw search term, bidirectional umlaut matching)
  function createUmlautPattern(searchTerm) {
    const escaped = escapeRegex(searchTerm);
    return escaped
      .replace(/ü/gi, '(?:ü|Ü|ue|Ue|UE|u|U)')
      .replace(/ä/gi, '(?:ä|Ä|ae|Ae|AE|a|A)')
      .replace(/ö/gi, '(?:ö|Ö|oe|Oe|OE|o|O)')
      .replace(/ue/gi, '(?:ue|Ue|UE|ü|Ü|u|U)')
      .replace(/ae/gi, '(?:ae|Ae|AE|ä|Ä|a|A)')
      .replace(/oe/gi, '(?:oe|Oe|OE|ö|Ö|o|O)')
      .replace(/u/gi, '(?:u|U|ü|Ü|ue|Ue|UE)')
      .replace(/a/gi, '(?:a|A|ä|Ä|ae|Ae|AE)')
      .replace(/o/gi, '(?:o|O|ö|Ö|oe|Oe|OE)');
  }

  // Used by applyHighlights (pre-normalized term → original variants for DOM highlighting)
  function umlautHighlightPattern(normTerm) {
    const e = escapeRegex(normTerm);
    return e
      .replace(/u/g, '(?:ue|Ue|UE|ü|Ü|u|U)')
      .replace(/a/g, '(?:ae|Ae|AE|ä|Ä|a|A)')
      .replace(/o/g, '(?:oe|Oe|OE|ö|Ö|o|O)');
  }

  /* ─────────────────────────────────────────────
     DataTable rendering helpers
     ───────────────────────────────────────────── */

  function generateSimpleRow(labelText, value, skipHighlight = false) {
    const displayValue = value;
    return '<tr><td class="details-placeholder"></td><td class="details-label">' + labelText +
      '</td><td class="details-value">' + displayValue + '</td><td class="details-CD" colspan="7"></td></tr>';
  }

  function generateSubtableRows(data, labelText, idPrefix, recordId = '') {
    let rows = '';
    if (!data) return rows;
    toArray(data).forEach((item, index) => {
      if (!item.label) return;
      const labelCell = getFirstLabel(index, labelText);
      const parts = ['description', 'comment'].filter(type => item[type]);
      const hasSearchMatch = false;
      const badges = parts.map(type => {
        const isActive = false;
        const iconName = 'plus-circle';
        return `<span class="cd-badge" data-target="${recordId}-${idPrefix}-${getTypeSuffix(type)}-${index}"><i data-feather="${iconName}" style="width: 12px; height: 12px; vertical-align: -2px; margin-right: 4px;"></i>${type}</span>`;
      }).join('');
      const highlightedLabel = item.label;
      const rowClass = '';
      rows += `<tr${rowClass}><td class="details-placeholder"></td><td class="details-label">${labelCell}</td><td class="details-value">${highlightedLabel}</td><td class="details-CD" colspan="7"><div class="cd-badges">${badges}</div>`;
      parts.forEach(type => {
        const contentId = `${recordId}-${idPrefix}-${getTypeSuffix(type)}-${index}`;
        const isActive = false;
        const displayStyle = manuallyHiddenContent.has(contentId) ? 'none' : 'none';
        rows += `<div class="CD-content" id="${contentId}" style="display: ${displayStyle};"><div class="CD-text">${item[type]}</div></div>`;
      });
      rows += '</td></tr>';
    });
    return rows;
  }

  function generateBibliographyRows(items, labelText, typeFilter) {
    let rows = '';
    const filtered = items.filter(item => {
      if (!item.referenceSource) return false;
      if (typeFilter === null)
        return item.referenceSource.referencebookType !== 'Edition' &&
               item.referenceSource.referencebookType !== 'Catalogue';
      return item.referenceSource.referencebookType === typeFilter;
    });
    filtered.forEach((item, index) => {
      let valueText = item.referenceSource.bookShort || '';
      if (item.referencePages)
        valueText += ': <span class="reference-pages">' + item.referencePages + '</span>';
      rows += generateSimpleRow(getFirstLabel(index, labelText), valueText);
    });
    return rows;
  }

  function wrapInSubgroup(rowHtml, subgroup, replaceAll = false) {
    const pattern = replaceAll ? /<tr(?:\s+class="([^"]*)")?\s*>/g : /<tr(?:\s+class="([^"]*)")?\s*>/;
    return rowHtml.replace(pattern, (match, existingClasses) => {
      const classes = existingClasses ? `subgroup-content ${existingClasses}` : 'subgroup-content';
      return `<tr class="${classes}" data-subgroup="${subgroup}" style="display:none">`;
    });
  }

  function generateSubgroupHeading(title, subgroup) {
    return `<tr class="subgroup-heading-row" data-subgroup="${subgroup}"><td class="details-placeholder"></td><td colspan="9" class="details-heading"><span class="heading-toggle">${title}</span></td></tr>`;
  }

  function generateSpacerRow(subgroup = null, small = false) {
    const className = small ? 'subgroup-spacer-small' : 'subgroup-spacer';
    const subgroupAttr = subgroup ? ` subgroup-content" data-subgroup="${subgroup}" style="display:none` : '';
    return `<tr class="${className}${subgroupAttr}"><td colspan="10"></td></tr>`;
  }

  function formatDetails(row) {
    const recordId = row.id ? row.id.split('/').pop() : Math.random().toString(36).substr(2, 9);
    const typeValue = row.physicalType ?
      row.physicalType.charAt(0).toUpperCase() + row.physicalType.slice(1) : '';
    let rows = '';

    if (row.alternativeTitle) rows += generateSimpleRow('Alternative title:', row.alternativeTitle);
    rows += generateSimpleRow('Type:', typeValue, true);
    rows += generateSpacerRow(null, true);

    if (row.provenance || row.function || row.fundamenta !== undefined || row.codicology) {
      rows += generateSubgroupHeading('Contextual Metadata', 'contextual');
      let contextualRows = '';
      contextualRows += generateSubtableRows(row.provenance, 'Provenance:', 'prov', recordId);
      contextualRows += generateSubtableRows(row.function, 'Function:', 'func', recordId);
      contextualRows += generateSimpleRow('Fundamenta:', row.fundamenta == 1 ? 'Yes' : 'No', true);
      contextualRows += generateSubtableRows(row.codicology, 'Codicology:', 'codic', recordId);
      rows += wrapInSubgroup(contextualRows, 'contextual', true);
      rows += generateSpacerRow('contextual');
    }

    if (row.brown || row.otherShelfmark) {
      rows += generateSubgroupHeading('Further Identifiers', 'identifiers');
      let identifiersRows = '';
      if (row.brown) identifiersRows += generateSimpleRow('Brown:', row.brown);
      if (row.otherShelfmark) {
        toArray(row.otherShelfmark).forEach((item, index) => {
          if (item && item.label) {
            const value = item.url
              ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.label}</a>`
              : item.label;
            identifiersRows += generateSimpleRow(getFirstLabel(index, 'Other shelfmarks:'), value);
          }
        });
      }
      rows += wrapInSubgroup(identifiersRows, 'identifiers', true);
      rows += generateSpacerRow('identifiers');
    }

    if (row.referencedBy || row.relatedResource) {
      rows += generateSubgroupHeading('Bibliography and Related Resources', 'bibliography');
      let bibliographyRows = '';
      if (row.referencedBy) {
        const refs = toArray(row.referencedBy);
        bibliographyRows += generateBibliographyRows(refs, 'Editions:', 'Edition');
        bibliographyRows += generateBibliographyRows(refs, 'Catalogues:', 'Catalogue');
        bibliographyRows += generateBibliographyRows(refs, 'Other bibliography:', null);
      }
      if (row.relatedResource) {
        toArray(row.relatedResource).forEach((item, index) => {
          if (item && item.label) {
            const value = item.url
              ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.label}</a>`
              : item.label;
            bibliographyRows += generateSimpleRow(getFirstLabel(index, 'Related resources:'), value);
          }
        });
      }
      rows += wrapInSubgroup(bibliographyRows, 'bibliography', true);
      rows += generateSpacerRow();
    }

    const widths = getColumnWidths();
    return '<div class="child-wrapper"><table class="details-table">' +
      '<colgroup>' +
      '<col style="width: ' + widths[0] + ';">' +
      '<col style="width: ' + widths[1] + ';">' +
      '<col style="width: ' + widths[2] + ';">' +
      '<col><col><col><col><col><col><col>' +
      '</colgroup>' + rows + '</table></div>';
  }

  function renderWithHighlight(data, type, removeBracket = false) {
    if (type === 'sort') return (removeBracket && data) ? data.replace(/^\[/, '') : (data || '');
    return (data || '');
  }

  function combineValues(row, primaryField, otherField) {
    const values = [];
    if (row[primaryField] && row[primaryField].label) values.push(row[primaryField].label);
    if (row[otherField]) {
      const items = Array.isArray(row[otherField]) ? row[otherField] : [row[otherField]];
      items.forEach(item => { if (item && item.label) values.push(item.label); });
    }
    return values.join('<br/>');
  }

  function renderCombinedField(row, primaryField, otherField, type) {
    if (type !== 'display') return '';
    const values = [];
    if (row[primaryField] && row[primaryField].label) {
      const h = row[primaryField].label;
      values.push(row[primaryField].url
        ? `<a href="${row[primaryField].url}" target="_blank" rel="noopener noreferrer">${h}</a>`
        : h);
    }
    if (row[otherField]) {
      const items = Array.isArray(row[otherField]) ? row[otherField] : [row[otherField]];
      items.forEach(item => {
        if (item && item.label) {
          const h = item.label;
          values.push(item.url
            ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer">${h}</a>`
            : h);
        }
      });
    }
    return values.join('<br/>');
  }

  /* ─────────────────────────────────────────────
     Filter panel template
     ───────────────────────────────────────────── */
  function accordion(prefix, label, n, contentClass, content) {
    return `
    <div class="phys-accordion" id="${prefix}Accordion${n}">
      <div class="phys-accordion-header header-split">
        <div class="phys-toggle-zone" id="${prefix}ToggleZone${n}">
          <span class="dot-label">${label}</span>${SVG_CHEVRON}
        </div>
        <span class="filter-value-tag" id="${prefix}Tag${n}" style="visibility:hidden; margin-left:15px;">
          <span id="${prefix}TagText${n}"></span><span class="phys-tag-x" id="${prefix}TagX${n}">×</span>
        </span>
      </div>
      <div class="phys-accordion-content${contentClass ? ' ' + contentClass : ''}">${content}</div>
    </div>`;
  }

  function buildFilterPanel(n) {
    return [
      accordion('phys', 'Physical type', n, '', `
        <div class="phys-radio-list phys-radio-list--row" id="physRadioList${n}"></div>`),
      accordion('date', 'Date', n, 'date-content', `
        <div class="range-slider-wrap">
          <div class="range-track"><div class="range-fill" id="dateFill${n}"></div></div>
          <input type="range" class="range-input range-min" id="dateMin${n}" min="1450" max="1620" value="1450" step="1">
          <input type="range" class="range-input range-max" id="dateMax${n}" min="1450" max="1620" value="1620" step="1">
        </div>
        <div class="range-labels">
          <input type="number" class="range-label-input" id="dateMinLabel${n}" value="1450" min="1450" max="1620">
          <input type="number" class="range-label-input" id="dateMaxLabel${n}" value="1620" min="1450" max="1620">
        </div>`),
      accordion('shelf', 'Shelfmarks', n, 'shelfmarks-content', `
        <input type="text" class="shelfmarks-search" id="shelfSearch${n}" placeholder="Search shelfmarks…">
        <div class="sm-chip-grid" id="shelfList${n}"></div>`),
      accordion('fn', 'Functions', n, 'shelfmarks-content', `
        <input type="text" class="shelfmarks-search" id="fnSearch${n}" placeholder="Search functions…">
        <div class="sm-chip-grid" id="fnList${n}"></div>`),
      accordion('funda', 'Fundamenta', n, '', `
        <div class="phys-radio-list phys-radio-list--row" id="fundaRadioList${n}"></div>`)
    ].join('');
  }

  /* ─────────────────────────────────────────────
     Render chips and radio lists
     ───────────────────────────────────────────── */
  function renderChipGrid(el, data) {
    data.forEach(item => {
      if (item.heading !== undefined) {
        const h = document.createElement('div');
        h.className = 'sm-group-heading'; h.textContent = item.heading;
        el.appendChild(h);
        item.chips.forEach(chip => {
          const s = document.createElement('span');
          s.className = 'sm-chip'; s.textContent = chip;
          el.appendChild(s);
        });
      } else {
        const s = document.createElement('span');
        s.className = 'sm-chip' + (typeof item === 'object' && item.cls ? ' ' + item.cls : '');
        s.textContent = typeof item === 'string' ? item : item.label;
        el.appendChild(s);
      }
    });
  }

  function renderRadioList(el, values) {
    values.forEach((val, i) => {
      const row = document.createElement('div');
      row.className = 'phys-radio-row' + (i === 0 ? ' active' : '');
      row.dataset.val = val;
      row.innerHTML = '<span class="phys-radio-circle"></span><span class="phys-radio-text">' + val + '</span>';
      el.appendChild(row);
    });
  }

  [1].forEach(n => {
    document.getElementById('filterPanel' + n).innerHTML = buildFilterPanel(n);
    // Shelfmarks will be rendered after data is loaded
    renderChipGrid(document.getElementById('fnList'    + n), FUNCTIONS_DATA);
    renderRadioList(document.getElementById('physRadioList'  + n), PHYS_RADIO_VALUES);
    renderRadioList(document.getElementById('fundaRadioList' + n), FUNDA_RADIO_VALUES);
  });

  /* ─────────────────────────────────────────────
     P2c mode-dropdown widget (Person / Place fields)
     ───────────────────────────────────────────── */
  function initModeDropdownEl(tabs, input, list, wrap, items) {
    let mode = 'free', highlighted = -1, listMemory = '', freeTextMemory = '';
    function showSelected(name) {
      input.value = name; 
      input.style.display = ''; 
      input.style.fontWeight = '600';
      // Trigger input event to update search results
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function hideInput(triggerEvent = false) {
      input.value = ''; 
      input.style.display = 'none';
      // Only trigger input event if explicitly requested (user cleared content)
      if (triggerEvent) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    function renderList() {
      list.innerHTML = ''; highlighted = -1;
      items.forEach(name => {
        const item = document.createElement('div');
        item.className = 'suggestion-item' + (name === listMemory ? ' is-selected' : '');
        item.textContent = name;
        item.addEventListener('mousedown', e => { e.preventDefault(); listMemory = name; showSelected(name); list.classList.remove('open'); });
        list.appendChild(item);
      });
      list.classList.add('open');
    }
    tabs.querySelectorAll('button').forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.querySelectorAll('button').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const prevMode = mode;
        mode = tab.dataset.mode;
        if (mode === 'list') {
          // Save free-text value before switching
          if (prevMode === 'free') {
            freeTextMemory = input.value.trim();
          }
          input.readOnly = true; input.style.caretColor = 'transparent'; input.placeholder = '';
          if (listMemory) { showSelected(listMemory); } else { hideInput(); }
          renderList();
        } else {
          list.classList.remove('open'); input.style.fontWeight = '';
          input.style.display = ''; input.readOnly = false; input.style.caretColor = '';
          input.placeholder = 'Search...';
          // Restore free-text value
          input.value = freeTextMemory;
          if (freeTextMemory) {
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      });
    });
    // Update freeTextMemory as user types in free mode
    input.addEventListener('input', () => {
      if (mode === 'free') {
        freeTextMemory = input.value.trim();
      }
    });
    wrap.addEventListener('click', () => { if (mode === 'list') renderList(); });
    input.addEventListener('keydown', e => {
      if (mode !== 'list') return;
      const its = list.querySelectorAll('.suggestion-item');
      if (e.key === 'Backspace' || e.key === 'Delete') { listMemory = ''; hideInput(true); renderList(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = Math.min(highlighted + 1, its.length - 1); its.forEach((el, i) => el.classList.toggle('highlighted', i === highlighted)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlighted = Math.max(highlighted - 1, 0); its.forEach((el, i) => el.classList.toggle('highlighted', i === highlighted)); }
      else if (e.key === 'Enter' && highlighted >= 0) { listMemory = its[highlighted].textContent; showSelected(listMemory); list.classList.remove('open'); }
      else if (e.key === 'Escape') { list.classList.remove('open'); }
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) list.classList.remove('open'); });
  }

  function createModeDropdownWidget(rowId, items) {
    const wrap  = document.createElement('div');  wrap.className = 'p2c-wrap'; wrap.style.flex = '1';
    const tabs  = document.createElement('div');  tabs.className = 'p2b-tabs';
    ['Text in source', 'From list'].forEach((label, i) => {
      const btn = document.createElement('button');
      btn.className = 'p2b-tab' + (i === 0 ? ' active' : '');
      btn.dataset.mode = i === 0 ? 'free' : 'list'; btn.textContent = label;
      tabs.appendChild(btn);
    });
    const divider = document.createElement('div'); divider.className = 'p2b-divider';
    const input   = document.createElement('input'); input.className = 'p2b-text'; input.placeholder = 'Search...';
    const list    = document.createElement('div'); list.className = 'suggestion-list';
    wrap.appendChild(tabs); wrap.appendChild(divider); wrap.appendChild(input); wrap.appendChild(list);
    initModeDropdownEl(tabs, input, list, wrap, items);
    return wrap;
  }

  /* ─────────────────────────────────────────────
     Search builder
     ───────────────────────────────────────────── */
  function createSearchWidget({ builderRowsId, addFieldBtnId, logicSectionId,
      logicToggleId, labelAndId, labelOrId, smartInputs = {}, showLogic = true, useCustomSelect = false }) {

    const builderRowsEl  = document.getElementById(builderRowsId);
    const addFieldBtnEl  = document.getElementById(addFieldBtnId);
    const logicSectionEl = logicSectionId ? document.getElementById(logicSectionId) : null;
    const logicToggleEl  = logicToggleId  ? document.getElementById(logicToggleId)  : null;
    const labelAndEl     = labelAndId     ? document.getElementById(labelAndId)     : null;
    const labelOrEl      = labelOrId      ? document.getElementById(labelOrId)      : null;

    let rows = [], nextId = 0;

    function getDefaultField() {
      const used = new Set(rows.map(r => r.field));
      return FIELDS.find(f => !used.has(f)) || FIELDS[0];
    }

    function updateUI() {
      const count = rows.length;
      addFieldBtnEl.disabled = count >= 10;
      builderRowsEl.querySelectorAll('.remove-btn').forEach(btn => { btn.disabled = count <= 1; });
      if (logicSectionEl && showLogic) logicSectionEl.style.display = count >= 2 ? 'flex' : 'none';
    }

    function addRow(field = '', animate = true) {
      const id = nextId++;
      const chosenField = field || getDefaultField();
      rows.push({ id, field: chosenField });

      const div = document.createElement('div');
      div.className = 'builder-row' + (animate ? ' new' : '');
      div.dataset.id = id;

      function makeInput(fieldName) {
        if (smartInputs[fieldName]) return smartInputs[fieldName](id);
        const inp = document.createElement('input');
        inp.className = 'builder-input'; inp.type = 'text'; inp.placeholder = 'Search…';
        return inp;
      }

      let currentInput = makeInput(chosenField);

      let fieldEl;
      if (useCustomSelect) {
        const cWrap = document.createElement('div'); cWrap.className = 'custom-field-select';
        const cBtn  = document.createElement('button'); cBtn.type = 'button'; cBtn.className = 'custom-field-btn'; cBtn.textContent = chosenField;
        const cDrop = document.createElement('div'); cDrop.className = 'custom-field-dropdown';
        FIELDS.forEach(f => {
          const cOpt = document.createElement('div');
          cOpt.className = 'custom-field-option' + (f === chosenField ? ' is-selected' : '');
          cOpt.textContent = f;
          cOpt.addEventListener('mousedown', e => {
            e.preventDefault();
            rows.find(r => r.id === id).field = f;
            cBtn.textContent = f;
            cDrop.querySelectorAll('.custom-field-option').forEach(o => o.classList.toggle('is-selected', o === cOpt));
            cDrop.classList.remove('open');
            const newInput = makeInput(f);
            div.replaceChild(newInput, currentInput); currentInput = newInput;
            updateUI();
          });
          cDrop.appendChild(cOpt);
        });
        cBtn.addEventListener('click', e => { e.stopPropagation(); cDrop.classList.toggle('open'); });
        document.addEventListener('click', () => cDrop.classList.remove('open'));
        cWrap.appendChild(cBtn); cWrap.appendChild(cDrop);
        fieldEl = cWrap;
      } else {
        const select = document.createElement('select'); select.className = 'field-select';
        FIELDS.forEach(f => {
          const opt = document.createElement('option'); opt.value = f; opt.textContent = f;
          if (f === chosenField) opt.selected = true;
          select.appendChild(opt);
        });
        select.addEventListener('change', () => {
          const newField = select.value;
          rows.find(r => r.id === id).field = newField;
          const newInput = makeInput(newField);
          div.replaceChild(newInput, currentInput); currentInput = newInput;
          updateUI();
          // Trigger search update since field changed (old input removed, new empty input created)
          redrawTable();
        });
        fieldEl = select;
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn'; removeBtn.innerHTML = SVG_X;
      removeBtn.addEventListener('click', () => { rows = rows.filter(r => r.id !== id); div.remove(); updateUI(); });

      div.appendChild(fieldEl); div.appendChild(currentInput); div.appendChild(removeBtn);
      builderRowsEl.appendChild(div);
      updateUI();
    }

    if (logicToggleEl) {
      logicToggleEl.addEventListener('change', () => {
        if (labelAndEl) labelAndEl.classList.toggle('active', !logicToggleEl.checked);
        if (labelOrEl)  labelOrEl.classList.toggle('active',  logicToggleEl.checked);
      });
    }

    addFieldBtnEl.addEventListener('click', () => addRow());
    addRow('All fields', false);
    addRow('Title', false);

    function reset() {
      builderRowsEl.innerHTML = ''; rows = []; nextId = 0;
      addRow('All fields', false); addRow('Title', false);
    }
    return reset;
  }

  /* ─────────────────────────────────────────────
     Filter panel + physical type wiring
     ───────────────────────────────────────────── */
  function setupSplitAccordion(n, updateSelectionUI, smartInputs = {}, options = {}) {
    const withLogic = options.showLogic !== false;
    const resetSearch = createSearchWidget({
      builderRowsId: `builderRows${n}`, addFieldBtnId: `addFieldBtn${n}`,
      logicSectionId: withLogic ? `logicSection${n}` : null,
      logicToggleId:  withLogic ? `logicToggle${n}`  : null,
      labelAndId:     withLogic ? `labelAnd${n}`     : null,
      labelOrId:      withLogic ? `labelOr${n}`      : null,
      smartInputs, showLogic: withLogic, useCustomSelect: !!options.useCustomSelect
    });

    const physAccordion = document.getElementById(`physAccordion${n}`);
    const physToggle    = document.getElementById(`physToggleZone${n}`);
    const physTag       = document.getElementById(`physTag${n}`);
    const physTagText   = document.getElementById(`physTagText${n}`);
    const physTagX      = document.getElementById(`physTagX${n}`);

    physToggle.addEventListener('click', () => physAccordion.classList.toggle('expanded'));

    function setVal(val) {
      if (val !== 'Both') physTagText.textContent = val;
      physTag.style.visibility = val === 'Both' ? 'hidden' : 'visible';
      updateSelectionUI(val);
    }

    physTagX.addEventListener('click', () => { 
      setVal('Both'); 
      redrawTable();
    });
    return { setVal, resetSearch };
  }

  /* ─────────────────────────────────────────────
     Date range accordion
     ───────────────────────────────────────────── */
  function initDateAccordion({ n, minYear = 1450, maxYear = 1620, onFilterChange = null }) {
    const accordion  = document.getElementById(`dateAccordion${n}`);
    const toggleZone = document.getElementById(`dateToggleZone${n}`);
    const tag        = document.getElementById(`dateTag${n}`);
    const tagText    = document.getElementById(`dateTagText${n}`);
    const tagX       = document.getElementById(`dateTagX${n}`);
    const minInput   = document.getElementById(`dateMin${n}`);
    const maxInput   = document.getElementById(`dateMax${n}`);
    const fill       = document.getElementById(`dateFill${n}`);
    const minLabel   = document.getElementById(`dateMinLabel${n}`);
    const maxLabel   = document.getElementById(`dateMaxLabel${n}`);

    toggleZone.addEventListener('click', () => accordion.classList.toggle('expanded'));

    function update() {
      const lo = parseInt(minInput.value), hi = parseInt(maxInput.value), span = maxYear - minYear;
      fill.style.left  = ((lo - minYear) / span * 100) + '%';
      fill.style.width = ((hi - lo)      / span * 100) + '%';
      if (document.activeElement !== minLabel) minLabel.value = lo;
      if (document.activeElement !== maxLabel) maxLabel.value = hi;
      minInput.style.zIndex = lo >= hi ? 5 : 3;
      const isDefault = lo === minYear && hi === maxYear;
      tag.style.visibility = isDefault ? 'hidden' : 'visible';
      if (!isDefault) tagText.textContent = `${lo}–${hi}`;
      if (onFilterChange) onFilterChange(!isDefault);
    }

    minInput.addEventListener('input', () => { 
      if (parseInt(minInput.value) > parseInt(maxInput.value)) minInput.value = maxInput.value; 
      update(); 
      redrawTable();
    });
    maxInput.addEventListener('input', () => { 
      if (parseInt(maxInput.value) < parseInt(minInput.value)) maxInput.value = minInput.value; 
      update(); 
      redrawTable();
    });
    minLabel.addEventListener('focus', () => minLabel.select());
    maxLabel.addEventListener('focus', () => maxLabel.select());

    function applyLabel(labelEl, isMin) {
      let val = parseInt(labelEl.value);
      if (isNaN(val)) val = isMin ? minYear : maxYear;
      val = Math.max(minYear, Math.min(maxYear, val));
      if (isMin) { val = Math.min(val, parseInt(maxInput.value)); minInput.value = val; }
      else       { val = Math.max(val, parseInt(minInput.value)); maxInput.value = val; }
      update();
    }

    minLabel.addEventListener('change', () => { applyLabel(minLabel, true); redrawTable(); });
    minLabel.addEventListener('blur',   () => { applyLabel(minLabel, true); redrawTable(); });
    maxLabel.addEventListener('change', () => { applyLabel(maxLabel, false); redrawTable(); });
    maxLabel.addEventListener('blur',   () => { applyLabel(maxLabel, false); redrawTable(); });
    tagX.addEventListener('click', () => { minInput.value = minYear; maxInput.value = maxYear; update(); redrawTable(); });
    update();
    return () => { minInput.value = minYear; maxInput.value = maxYear; update(); };
  }

  /* ─────────────────────────────────────────────
     Chip shelfmarks / functions accordion
     ───────────────────────────────────────────── */
  function initChipShelfmarksAccordion({ n, prefix = 'shelf', showValues = false, onFilterChange = null }) {
    const accordion   = document.getElementById(`${prefix}Accordion${n}`);
    const toggleZone  = document.getElementById(`${prefix}ToggleZone${n}`);
    const tag         = document.getElementById(`${prefix}Tag${n}`);
    const tagText     = document.getElementById(`${prefix}TagText${n}`);
    const tagX        = document.getElementById(`${prefix}TagX${n}`);
    const searchInput = document.getElementById(`${prefix}Search${n}`);
    const list        = document.getElementById(`${prefix}List${n}`);

    toggleZone.addEventListener('click', () => accordion.classList.toggle('expanded'));

    let pillRow = null;
    if (showValues) {
      tag.style.display = 'none';
      pillRow = document.createElement('div');
      pillRow.className = 'pill-tags-row';
      accordion.querySelector('.phys-accordion-header').appendChild(pillRow);
    }

    function updateTag() {
      const selected = list.querySelectorAll('.sm-chip.selected');
      const count = selected.length;
      if (onFilterChange) onFilterChange(count > 0);
      if (showValues) {
        pillRow.innerHTML = '';
        Array.from(selected).forEach((chip, i) => {
          if (i > 0) { const sep = document.createElement('span'); sep.className = 'pill-or'; sep.textContent = 'or'; pillRow.appendChild(sep); }
          const pill = document.createElement('span');
          pill.className = 'pill-chip' + (chip.classList.contains('sm-chip--grey') ? ' pill-chip--grey' : '');
          pill.textContent = chip.textContent;
          const x = document.createElement('span'); x.className = 'pill-chip-x'; x.textContent = '×';
          x.addEventListener('click', () => { chip.classList.remove('selected'); updateTag(); redrawTable(); });
          pill.appendChild(x); pillRow.appendChild(pill);
        });
      } else {
        tag.style.visibility = count === 0 ? 'hidden' : 'visible';
        if (count > 0) tagText.textContent = count === 1 ? '1 selected' : `${count} selected`;
      }
    }

    list.addEventListener('click', e => { 
      const chip = e.target.closest('.sm-chip'); 
      if (!chip) return; 
      chip.classList.toggle('selected'); 
      updateTag(); 
      redrawTable();
    });
    
    const resetChips = () => { 
      list.querySelectorAll('.sm-chip.selected').forEach(c => c.classList.remove('selected')); 
      updateTag(); 
    };
    
    if (!showValues) {
      tagX.addEventListener('click', () => { 
        resetChips(); 
        redrawTable();
      });
    }
    
    searchInput.addEventListener('input', () => {
      const term = searchInput.value.toLowerCase();
      list.querySelectorAll('.sm-chip').forEach(chip => { chip.style.display = chip.textContent.toLowerCase().includes(term) ? '' : 'none'; });
      list.querySelectorAll('.sm-group-heading').forEach(heading => {
        let sibling = heading.nextElementSibling, anyVisible = false;
        while (sibling && !sibling.classList.contains('sm-group-heading')) {
          if (sibling.style.display !== 'none') anyVisible = true;
          sibling = sibling.nextElementSibling;
        }
        heading.style.display = anyVisible ? '' : 'none';
      });
    });
    updateTag();
    return resetChips;
  }

  /* ─────────────────────────────────────────────
     Fundamenta accordion
     ───────────────────────────────────────────── */
  function initFundamentaAccordion({ n, onFilterChange = null }) {
    const accordion  = document.getElementById(`fundaAccordion${n}`);
    const toggleZone = document.getElementById(`fundaToggleZone${n}`);
    const tag        = document.getElementById(`fundaTag${n}`);
    const tagText    = document.getElementById(`fundaTagText${n}`);
    const tagX       = document.getElementById(`fundaTagX${n}`);
    const rows       = document.querySelectorAll(`#fundaRadioList${n} .phys-radio-row`);

    toggleZone.addEventListener('click', () => accordion.classList.toggle('expanded'));

    function setVal(val) {
      tag.style.visibility = val === 'Both' ? 'hidden' : 'visible';
      if (val !== 'Both') tagText.textContent = val;
      rows.forEach(r => r.classList.toggle('active', r.dataset.val === val));
      if (onFilterChange) onFilterChange(val !== 'Both');
    }

    rows.forEach(r => r.addEventListener('click', () => { 
      setVal(r.dataset.val); 
      redrawTable();
    }));
    tagX.addEventListener('click', () => { 
      setVal('Both'); 
      redrawTable();
    });
    return () => setVal('Both');
  }

  /* ─────────────────────────────────────────────
     Active-state pill
     ───────────────────────────────────────────── */
  const pill = document.getElementById('searchPill');
  const pillState = { fields: 0, filters: 0 };
  const toolboxSearchItems = document.getElementById('toolboxSearchItems');
  const toolboxFilterItems = document.getElementById('toolboxFilterItems');
  const toolboxFiltersSection = document.getElementById('toolboxFiltersSection');

  function getBuilderRowData(row) {
    const field = (row.querySelector('.field-select') || {}).value || 'All fields';
    const inp = row.querySelector('.builder-input, .p2b-text');
    const value = inp ? inp.value.trim() : '';
    
    // Detect mode for Person/Place fields (free-text vs list)
    let mode = 'free'; // default
    const activeTab = row.querySelector('.p2b-tab.active');
    if (activeTab && activeTab.dataset.mode) {
      mode = activeTab.dataset.mode;
    }
    
    return { field, inp, value, mode };
  }

  function updatePill() {
    // Update toolbox content first to recalculate pillState values
    updateToolboxContent();
    
    const f = pillState.fields, fi = pillState.filters;
    if (f === 0 && fi === 0) { 
      pill.classList.remove('visible'); 
      // Close the toolbox when there's nothing to show
      const toolbox = document.getElementById('searchToolbox');
      const chevron = document.getElementById('pillChevron');
      if (toolbox) toolbox.classList.remove('visible');
      if (chevron) chevron.classList.remove('open');
      return; 
    }
    const parts = [];
    if (f  > 0) parts.push(f  === 1 ? '1 search field'  : `${f} search fields`);
    if (fi > 0) parts.push(fi === 1 ? '1 filter' : `${fi} filters`);
    const text = parts.join(' · ');
    pill.innerHTML = text + '<span class="pill-chevron" id="pillChevron"><svg viewBox="0 0 12 8"><polyline points="2 2, 6 6, 10 2"/></svg></span>';
    pill.classList.add('visible');
  }
  
  function createToolboxItem(label, value, onRemove, showLabel = true) {
    const item = document.createElement('div');
    item.className = 'e-item';
    item.style.display = 'inline-flex';
    item.style.alignItems = 'center';
    if (showLabel && label) {
      item.innerHTML = `
        <span class="e-item-label">${label}: <span class="e-item-value">${value}</span><button class="e-item-remove" type="button">${SVG_X}</button></span>
      `;
    } else {
      item.innerHTML = `
        <span class="e-item-label"><span class="e-item-value">${value}</span><button class="e-item-remove" type="button">${SVG_X}</button></span>
      `;
    }
    const removeBtn = item.querySelector('.e-item-remove');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove();
    });
    return item;
  }

  function updateToolboxContent() {
    // Update search items
    toolboxSearchItems.innerHTML = '';
    toolboxSearchItems.style.display = 'flex';
    toolboxSearchItems.style.flexWrap = 'wrap';
    toolboxSearchItems.style.gap = '8px';
    let searchCount = 0;
    const seenSearchLabels = new Set();
    builderRowsEl.querySelectorAll('.builder-row').forEach(row => {
      const { field, inp, value } = getBuilderRowData(row);
      if (value) {
        searchCount++;
        const showLabel = !seenSearchLabels.has(field);
        seenSearchLabels.add(field);
        const item = createToolboxItem(field, value, () => {
          if (inp) inp.value = '';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }, showLabel);
        toolboxSearchItems.appendChild(item);
      }
    });
    
    // Update the pill state with the recalculated search field count
    pillState.fields = searchCount;
    
    // Update filter items
    toolboxFilterItems.innerHTML = '';
    toolboxFilterItems.style.display = 'flex';
    toolboxFilterItems.style.flexWrap = 'wrap';
    toolboxFilterItems.style.gap = '8px';
    let filterCount = 0;
    
    // Physical type filter
    const physType = document.querySelector('#physRadioList1 .phys-radio-row.active');
    if (physType && physType.dataset.val !== 'Both') {
      filterCount++;
      const item = createToolboxItem('Physical type', physType.dataset.val, () => {
        // Directly update the radio selection without triggering click events
        const allRows = document.querySelectorAll('#physRadioList1 .phys-radio-row');
        allRows.forEach(r => r.classList.remove('active'));
        const bothRow = document.querySelector('#physRadioList1 .phys-radio-row[data-val="Both"]');
        if (bothRow) bothRow.classList.add('active');
        
        // Update the tag visibility
        const physTag = document.getElementById('physTag1');
        if (physTag) physTag.style.visibility = 'hidden';
        
        updatePill();
        redrawTable();
      });
      toolboxFilterItems.appendChild(item);
    }
    
    // Date range filter
    const dateRange = getActiveDateRange();
    if (dateRange.min !== 1450 || dateRange.max !== 1620) {
      filterCount++;
      const item = createToolboxItem('Date', `${dateRange.min}–${dateRange.max}`, () => {
        // Directly reset the date range without triggering click events
        const minInput = document.getElementById('dateMin1');
        const maxInput = document.getElementById('dateMax1');
        const dateTag = document.getElementById('dateTag1');
        const dateFill = document.getElementById('dateFill1');
        const minLabel = document.getElementById('dateMinLabel1');
        const maxLabel = document.getElementById('dateMaxLabel1');
        
        if (minInput) minInput.value = 1450;
        if (maxInput) maxInput.value = 1620;
        if (minLabel) minLabel.value = 1450;
        if (maxLabel) maxLabel.value = 1620;
        if (dateTag) dateTag.style.visibility = 'hidden';
        if (dateFill) {
          dateFill.style.left = '0%';
          dateFill.style.width = '100%';
        }
        
        updatePill();
        redrawTable();
      });
      toolboxFilterItems.appendChild(item);
    }
    
    // Shelfmarks filter
    const activeShelfmarks = getActiveShelfmarks();
    if (activeShelfmarks.length > 0) {
      filterCount++;
      const shelfList = document.getElementById('shelfList1');
      const selectedChips = shelfList ? shelfList.querySelectorAll('.sm-chip.selected') : [];
      
      let isFirstShelfmark = true;
      selectedChips.forEach(chip => {
        const item = createToolboxItem('Shelfmark', chip.textContent, () => {
          // Directly deselect the chip without triggering click events
          // This prevents the "click outside toolbox" handler from closing the toolbox
          chip.classList.remove('selected');
          
          // Get the updated list of selected chips
          const shelfList = document.getElementById('shelfList1');
          const selected = shelfList.querySelectorAll('.sm-chip.selected');
          const count = selected.length;
          
          // Update the pill tags row in the accordion header
          const pillTagsRow = document.querySelector('#shelfAccordion1 .pill-tags-row');
          if (pillTagsRow) {
            pillTagsRow.innerHTML = '';
            Array.from(selected).forEach((selectedChip, i) => {
              if (i > 0) {
                const sep = document.createElement('span');
                sep.className = 'pill-or';
                sep.textContent = 'or';
                pillTagsRow.appendChild(sep);
              }
              const pill = document.createElement('span');
              pill.className = 'pill-chip' + (selectedChip.classList.contains('sm-chip--grey') ? ' pill-chip--grey' : '');
              pill.textContent = selectedChip.textContent;
              const x = document.createElement('span');
              x.className = 'pill-chip-x';
              x.textContent = '×';
              x.addEventListener('click', () => {
                selectedChip.classList.remove('selected');
                updatePill();
                redrawTable();
              });
              pill.appendChild(x);
              pillTagsRow.appendChild(pill);
            });
          }
          
          updatePill();
          redrawTable();
        }, isFirstShelfmark);
        isFirstShelfmark = false;
        toolboxFilterItems.appendChild(item);
      });
    }
    
    // Functions filter
    const fnList = document.getElementById('fnList1');
    if (fnList) {
      const selectedFunctions = fnList.querySelectorAll('.sm-chip.selected');
      if (selectedFunctions.length > 0) {
        filterCount++;
        let isFirstFunction = true;
        selectedFunctions.forEach(chip => {
          const item = createToolboxItem('Function', chip.textContent, () => {
            chip.classList.remove('selected');
            
            const fnList = document.getElementById('fnList1');
            const selected = fnList.querySelectorAll('.sm-chip.selected');
            
            const pillTagsRow = document.querySelector('#fnAccordion1 .pill-tags-row');
            if (pillTagsRow) {
              pillTagsRow.innerHTML = '';
              Array.from(selected).forEach((selectedChip, i) => {
                if (i > 0) {
                  const sep = document.createElement('span');
                  sep.className = 'pill-or';
                  sep.textContent = 'or';
                  pillTagsRow.appendChild(sep);
                }
                const pill = document.createElement('span');
                pill.className = 'pill-chip' + (selectedChip.classList.contains('sm-chip--grey') ? ' pill-chip--grey' : '');
                pill.textContent = selectedChip.textContent;
                const x = document.createElement('span');
                x.className = 'pill-chip-x';
                x.textContent = '×';
                x.addEventListener('click', () => {
                  selectedChip.classList.remove('selected');
                  updatePill();
                  redrawTable();
                });
                pill.appendChild(x);
                pillTagsRow.appendChild(pill);
              });
            }
            
            updatePill();
            redrawTable();
          }, isFirstFunction);
          isFirstFunction = false;
          toolboxFilterItems.appendChild(item);
        });
      }
    }
    
    // Fundamenta filter
    const fundaActive = document.querySelector('#fundaRadioList1 .phys-radio-row.active');
    if (fundaActive && fundaActive.dataset.val !== 'Both') {
      filterCount++;
      const item = createToolboxItem('Fundamenta', fundaActive.dataset.val, () => {
        const allRows = document.querySelectorAll('#fundaRadioList1 .phys-radio-row');
        allRows.forEach(r => r.classList.remove('active'));
        const bothRow = document.querySelector('#fundaRadioList1 .phys-radio-row[data-val="Both"]');
        if (bothRow) bothRow.classList.add('active');
        
        const fundaTag = document.getElementById('fundaTag1');
        if (fundaTag) fundaTag.style.visibility = 'hidden';
        
        updatePill();
        redrawTable();
      });
      toolboxFilterItems.appendChild(item);
    }
    
    // Show/hide sections based on content
    toolboxFiltersSection.style.display = filterCount > 0 ? '' : 'none';
    
    // Update the pill state with the recalculated filter count
    pillState.filters = filterCount;
    
    // Update "Clear all filters" button visibility based on actual filter count
    const clearFiltersBtn = document.getElementById('clearFiltersBtn1');
    if (clearFiltersBtn) {
      clearFiltersBtn.style.display = filterCount > 0 ? '' : 'none';
    }
  }

  const builderRowsEl = document.getElementById('builderRows1');

  builderRowsEl.addEventListener('input', () => {
    let count = 0;
    builderRowsEl.querySelectorAll('.builder-row').forEach(row => {
      const { value } = getBuilderRowData(row);
      if (value) count++;
    });
    const previousCount = pillState.fields;
    pillState.fields = count;
    updatePill();
    
    // Only redraw table if there are search terms or if we just cleared the last term
    if (count > 0 || previousCount > 0) {
      redrawTable();
    }
  });

  /* ─────────────────────────────────────────────
     Initialise search interface
     ───────────────────────────────────────────── */
  let resetSearch;

  // Function to initialize search interface with dynamic data
  function initializeSearchInterface() {
    const CARD_CONFIGS = [
      { n: 1, options: { showLogic: false, showChipValues: true, filterCount: true } }
    ];

    CARD_CONFIGS.forEach(({ n, options }) => {
      const physRows = document.querySelectorAll(`#physRadioList${n} .phys-radio-row`);

      let onFilterChange = null;
      let clearFiltersBtn = null;
      if (options.filterCount) {
        clearFiltersBtn = document.getElementById(`clearFiltersBtn${n}`);
        const activeFilters = new Set();
        onFilterChange = (key, isActive) => {
          if (isActive) activeFilters.add(key);
          else activeFilters.delete(key);
          const count = activeFilters.size;
          clearFiltersBtn.style.display = count > 0 ? '' : 'none';
          pillState.filters = count; updatePill();
        };
      }

      const { setVal, resetSearch: rs } = setupSplitAccordion(n,
        val => {
          physRows.forEach(r => r.classList.toggle('active', r.dataset.val === val));
          if (onFilterChange) onFilterChange('phys', val !== 'Both');
        },
        {
          'Person': (rowId) => createModeDropdownWidget(rowId, DYNAMIC_PERSONS),
          'Place':  (rowId) => createModeDropdownWidget(rowId, DYNAMIC_PLACES)
        },
        options
      );
      resetSearch = rs;
      physRows.forEach(r => r.addEventListener('click', () => { 
        setVal(r.dataset.val); 
        redrawTable();
      }));
      const resetDate  = initDateAccordion({ n, onFilterChange: onFilterChange ? v => onFilterChange('date', v) : null });
      const resetShelf = initChipShelfmarksAccordion({ n, showValues: !!options.showChipValues, onFilterChange: onFilterChange ? v => onFilterChange('shelf', v) : null });
      const resetFn    = initChipShelfmarksAccordion({ n, prefix: 'fn', showValues: !!options.showChipValues, onFilterChange: onFilterChange ? v => onFilterChange('fn', v) : null });
      const resetFunda = initFundamentaAccordion({ n, onFilterChange: onFilterChange ? v => onFilterChange('funda', v) : null });

      if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
          setVal('Both');
          resetDate(); resetShelf(); resetFn(); resetFunda();
          document.getElementById(`filterPanel${n}`)
            .querySelectorAll('.phys-accordion.expanded')
            .forEach(a => a.classList.remove('expanded'));
          redrawTable();
        });
      }
    });
  }

  /* ─────────────────────────────────────────────
     Drawer open / close
     ───────────────────────────────────────────── */
  const icon     = document.getElementById('searchIconBtn');
  const dropdown = document.getElementById('searchDropdown');
  const overlay  = document.getElementById('searchOverlay');

  function openDropdown()  { dropdown.classList.add('open');    icon.classList.add('drawer-open');    overlay.classList.add('show'); }
  function closeDropdown() { dropdown.classList.remove('open'); icon.classList.remove('drawer-open'); overlay.classList.remove('show'); }

  icon.addEventListener('click', () => dropdown.classList.contains('open') ? closeDropdown() : openDropdown());
  overlay.addEventListener('click', closeDropdown);

  /* ─────────────────────────────────────────────
     Pill toolbox toggle
     ───────────────────────────────────────────── */
  const toolbox = document.getElementById('searchToolbox');
  
  // Toggle toolbox when pill is clicked
  pill.addEventListener('click', function(e) {
    const chevron = document.getElementById('pillChevron');
    if (chevron) {
      toolbox.classList.toggle('visible');
      chevron.classList.toggle('open');
    }
  });
  
  // Close toolbox when clicking outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.h7-pill-toolbox-wrapper')) {
      const chevron = document.getElementById('pillChevron');
      toolbox.classList.remove('visible');
      if (chevron) chevron.classList.remove('open');
    }
  });
  
  // Toolbox "Clear all" button
  const toolboxClearBtn = document.getElementById('toolboxClearBtn');
  if (toolboxClearBtn) {
    toolboxClearBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      // Clear all search fields
      resetSearch();
      pillState.fields = 0;
      
      // Clear all filters
      const clearFiltersBtn = document.getElementById('clearFiltersBtn1');
      if (clearFiltersBtn) clearFiltersBtn.click(); // This already calls table.draw()
      
      // Defensive: ensure filter count is fully reset
      pillState.filters = 0;
      
      updatePill();
    });
  }

  /* ─────────────────────────────────────────────
     Clear search fields button
     ───────────────────────────────────────────── */
  (function () {
    const clearBtn = document.getElementById('clearSearchBtn1');

    function updateClearBtn() {
      const hasInput = Array.from(builderRowsEl.querySelectorAll('.builder-input, .p2b-text'))
        .some(inp => inp.value.trim());
      clearBtn.style.display = hasInput ? '' : 'none';
    }

    builderRowsEl.addEventListener('input', updateClearBtn);
    builderRowsEl.addEventListener('click', e => { if (e.target.closest('.remove-btn')) setTimeout(updateClearBtn, 0); });

    clearBtn.addEventListener('click', () => {
      resetSearch();
      pillState.fields = 0; updatePill();
      updateClearBtn();
      redrawTable();
    });
  })();

  /* ─────────────────────────────────────────────
     Search/filter logic (AND-logic between fields)
     ───────────────────────────────────────────── */
  function getActiveRows() {
    const active = [];
    builderRowsEl.querySelectorAll('.builder-row').forEach(row => {
      const { field, value, mode } = getBuilderRowData(row);
      if (value) active.push({ field, value: value.toLowerCase(), mode });
    });
    return active;
  }

  function getActiveTitleTerm() {
    let term = '';
    builderRowsEl.querySelectorAll('.builder-row').forEach(row => {
      const { field, value } = getBuilderRowData(row);
      if ((field === 'Title' || field === 'All fields') && value) term = value;
    });
    return term;
  }

  function rowMatches(row, field, value, mode = 'free') {
    switch (field) {
      case 'All fields': {
        // Split search value into individual words for independent matching
        const words = value.split(/\s+/).filter(w => w.length > 0);
        
        // Check if each word appears somewhere in the row's fields
        return words.every(word => {
          // Simple fields
          const simpleFields = [
            row.shelfmark?.label, row.title, row.shortTitle, row.alternativeTitle,
            row.date?.label, row.author?.label, row.publisher?.label,
            row.printPlace?.label, row.rism?.label, row.vd16?.label, row.brown
          ];
          if (simpleFields.some(v => (v || '').toLowerCase().includes(word))) {
            return true;
          }
          // Check otherRism and otherVD16 (arrays of objects with .label)
          if (labelArrayMatches(row.otherRism, word) || labelArrayMatches(row.otherVD16, word)) {
            return true;
          }
          // Check bibliography fields (including referencedBy and relatedResource)
          if (checkBibliographyFields(row, word)) {
            return true;
          }
          // Check provenance (can be array)
          if (provenanceMatches(row.provenance, word)) {
            return true;
          }
          // Check function and codicology (arrays of objects with .label)
          if (labelArrayMatches(row.function, word) || labelArrayMatches(row.codicology, word)) {
            return true;
          }
          return false;
        });
      }
      case 'Title':
        return (row.title || '').toLowerCase().includes(value) ||
               (row.alternativeTitle || '').toLowerCase().includes(value);
      case 'Person': {
        // List mode: search in normalizedName, Free-text mode: search in label
        const fieldToCheck = mode === 'list' ? 'normalizedName' : 'label';
        return (row.author?.[fieldToCheck] || '').toLowerCase().includes(value) ||
               (row.publisher?.[fieldToCheck] || '').toLowerCase().includes(value);
      }
      case 'Place': {
        // List mode: search in normalizedName, Free-text mode: search in label
        const fieldToCheck = mode === 'list' ? 'normalizedName' : 'label';
        // Check printPlace
        if ((row.printPlace?.[fieldToCheck] || '').toLowerCase().includes(value)) {
          return true;
        }
        // Check provenance (can be array or single object)
        return provenanceMatches(row.provenance, value, fieldToCheck);
      }
      case 'RISM / VD16 / Brown ID': {
        // Check rism, vd16, and brown
        if ((row.rism?.label || '').toLowerCase().includes(value) ||
            (row.vd16?.label || '').toLowerCase().includes(value) ||
            (row.brown || '').toLowerCase().includes(value)) {
          return true;
        }
        // Check otherRism and otherVD16 (arrays of objects with .label)
        if (labelArrayMatches(row.otherRism, value) || labelArrayMatches(row.otherVD16, value)) {
          return true;
        }
        return false;
      }
      case 'Description / Comment': {
        return checkAllDescriptionComment(row, value);
      }
      case 'Bibliography':
        return checkBibliographyFields(row, value);
      default:
        return false;
    }
  }

  function getActivePhysicalType() {
    const activeRow = document.querySelector('#physRadioList1 .phys-radio-row.active');
    return activeRow ? activeRow.dataset.val : 'Both';
  }

  function getActiveDateRange() {
    const minInput = document.getElementById('dateMin1');
    const maxInput = document.getElementById('dateMax1');
    if (!minInput || !maxInput) return { min: 1450, max: 1620 };
    return {
      min: parseInt(minInput.value) || 1450,
      max: parseInt(maxInput.value) || 1620
    };
  }

  function getActiveShelfmarks() {
    const list = document.getElementById('shelfList1');
    if (!list) return [];
    const selected = list.querySelectorAll('.sm-chip.selected');
    return Array.from(selected).map(chip => chip.textContent.toLowerCase());
  }

  $.fn.dataTable.ext.search.push(function (settings, _data, dataIndex) {
    if (settings.nTable.id !== 'sourcesTable') return true;
    if (!table) return true;
    const active = getActiveRows();
    const rowData = table.row(dataIndex).data();
    if (!rowData) return true;
    
    // Apply search field filters (AND logic)
    if (active.length > 0) {
      const searchMatch = active.every(({ field, value, mode }) => rowMatches(rowData, field, value, mode));
      if (!searchMatch) return false;
    }
    
    // Apply physical type filter
    const physType = getActivePhysicalType();
    if (physType !== 'Both') {
      const rowPhysType = rowData.physicalType ? 
        rowData.physicalType.charAt(0).toUpperCase() + rowData.physicalType.slice(1) : '';
      if (physType !== rowPhysType) return false;
    }
    
    // Apply date range filter (using ex15.js logic)
    const dateRange = getActiveDateRange();
    if (rowData.date && rowData.date.timespan && rowData.date.timespan.earliestDate && rowData.date.timespan.earliestDate.value) {
      const earliestDate = parseInt(rowData.date.timespan.earliestDate.value);
      if (earliestDate < dateRange.min || earliestDate > dateRange.max) {
        return false;
      }
    }
    
    // Apply shelfmarks filter (OR logic - match if any selected shelfmark matches)
    const activeShelfmarks = getActiveShelfmarks();
    if (activeShelfmarks.length > 0) {
      const rowShelfmarks = [];
      if (rowData.shelfmark && rowData.shelfmark.label) {
        rowShelfmarks.push(rowData.shelfmark.label.toLowerCase());
      }
      if (rowData.otherShelfmark) {
        const otherShelfmarks = Array.isArray(rowData.otherShelfmark) ? rowData.otherShelfmark : [rowData.otherShelfmark];
        otherShelfmarks.forEach(shelf => {
          if (shelf && shelf.label) rowShelfmarks.push(shelf.label.toLowerCase());
        });
      }
      const hasMatch = activeShelfmarks.some(activeShelf => 
        rowShelfmarks.some(rowShelf => rowShelf === activeShelf)
      );
      if (!hasMatch) return false;
    }
    
    return true;
  });

  /* ─────────────────────────────────────────────
     Post-draw highlighting
     ───────────────────────────────────────────── */


  // Expand child rows whose match is only in detail fields (not shown in main table).
  // Helper function to show specific subgroups in a DataTables child row
  function showSubgroupsInChildRow(row, subgroups) {
    const childRow = $(row.child());
    if (childRow.length) {
      subgroups.forEach(subgroup => {
        childRow.find(`.subgroup-content[data-subgroup="${subgroup}"]`).show();
      });
    }
  }

  // Helper function to check if provenance data matches a search value
  function provenanceMatches(provenance, value, fieldName = 'label') {
    if (!provenance) return false;
    const provenances = Array.isArray(provenance) ? provenance : [provenance];
    return provenances.some(prov => (prov?.[fieldName] || '').toLowerCase().includes(value));
  }

  // Helper function to check if array of objects with .label property matches a search value
  function labelArrayMatches(data, value) {
    if (!data) return false;
    const items = Array.isArray(data) ? data : [data];
    return items.some(item => (item?.label || '').toLowerCase().includes(value));
  }

  // Helper function to check if nested description/comment fields match a search value
  function nestedDescriptionMatches(data, value) {
    if (!data) return false;
    const items = Array.isArray(data) ? data : [data];
    return items.some(item => 
      (item?.description || '').toLowerCase().includes(value) ||
      (item?.comment || '').toLowerCase().includes(value)
    );
  }

  // Helper function to get contentIds for nested description/comment matches
  // Returns array of {contentId, type} objects for items that match
  function getMatchedNestedContentIds(data, value, recordId, idPrefix) {
    if (!data) return [];
    const items = Array.isArray(data) ? data : [data];
    const matches = [];
    items.forEach((item, index) => {
      if ((item?.description || '').toLowerCase().includes(value)) {
        matches.push({
          contentId: `${recordId}-${idPrefix}-desc-${index}`,
          type: 'description'
        });
      }
      if ((item?.comment || '').toLowerCase().includes(value)) {
        matches.push({
          contentId: `${recordId}-${idPrefix}-comm-${index}`,
          type: 'comment'
        });
      }
    });
    return matches;
  }

  // Helper to check description and comment fields
  function checkDescriptionComment(rowData, value) {
    return (rowData.description || '').toLowerCase().includes(value) ||
           (rowData.comment || '').toLowerCase().includes(value);
  }

  // Helper to check all description/comment fields including nested ones
  function checkAllDescriptionComment(rowData, value) {
    // Check main description/comment
    if (checkDescriptionComment(rowData, value)) {
      return true;
    }
    // Check nested description/comment in provenance, function, codicology
    return nestedDescriptionMatches(rowData.provenance, value) ||
           nestedDescriptionMatches(rowData.function, value) ||
           nestedDescriptionMatches(rowData.codicology, value);
  }

  // Helper to check a simple field and optionally add to subgroup
  function checkSimpleField(rowData, fieldName, value, matchedSubgroups, subgroupName = null) {
    if (rowData[fieldName] && (rowData[fieldName] || '').toLowerCase().includes(value)) {
      if (subgroupName) {
        matchedSubgroups.add(subgroupName);
      }
      return true;
    }
    return false;
  }

  // Helper to check bibliography and related resources fields
  function checkBibliographyFields(rowData, value) {
    // Check referencedBy array (contains referenceSource.bookShort and referencePages)
    if (rowData.referencedBy) {
      const refs = Array.isArray(rowData.referencedBy) ? rowData.referencedBy : [rowData.referencedBy];
      for (const item of refs) {
        if (item.referenceSource?.bookShort && item.referenceSource.bookShort.toLowerCase().includes(value)) {
          return true;
        }
        if (item.referencePages && item.referencePages.toLowerCase().includes(value)) {
          return true;
        }
      }
    }
    // Check relatedResource array (contains label)
    if (rowData.relatedResource) {
      const resources = Array.isArray(rowData.relatedResource) ? rowData.relatedResource : [rowData.relatedResource];
      for (const item of resources) {
        if (item.label && item.label.toLowerCase().includes(value)) {
          return true;
        }
      }
    }
    return false;
  }

  // Helper function to check all nested contextual fields and collect badge activations
  function checkNestedContextualFields(rowData, value, recordId, matchedSubgroups, badgesToActivate) {
    const fields = [
      { data: rowData.provenance, idPrefix: 'prov' },
      { data: rowData.function, idPrefix: 'func' },
      { data: rowData.codicology, idPrefix: 'codic' }
    ];
    
    let hasMatch = false;
    fields.forEach(({ data, idPrefix }) => {
      if (nestedDescriptionMatches(data, value)) {
        hasMatch = true;
        matchedSubgroups.add('contextual');
        badgesToActivate.push(...getMatchedNestedContentIds(data, value, recordId, idPrefix));
      }
    });
    
    return hasMatch;
  }

  // Uses a native DOM click on cells[0] (the dt-control chevron column) —
  // a real browser event that bubbles and reliably triggers the delegated click handler.
  function expandAltTitleMatches() {
    const active = getActiveRows();
    if (active.length === 0) return;
    
    table.rows({ page: 'current' }).every(function () {
      const rowData = this.data();
      if (!rowData) return;
      
      // Get recordId for this row
      const recordId = rowData.id ? rowData.id.split('/').pop() : Math.random().toString(36).substr(2, 9);
      
      // Track which subgroups contain matches and whether there are any detail matches
      let hasDetailMatch = false;
      const matchedSubgroups = new Set();
      const badgesToActivate = [];
      
      active.forEach(({ field, value, mode }) => {
        // Skip Person field - person data is only in main table
        if (field === 'Person') return;
        
        // For "Place" field, check provenance (detail section, contextual subgroup)
        if (field === 'Place' && rowData.provenance) {
          const fieldToCheck = mode === 'list' ? 'normalizedName' : 'label';
          if (provenanceMatches(rowData.provenance, value, fieldToCheck)) {
            hasDetailMatch = true;
            matchedSubgroups.add('contextual');
          }
        }
        
        // For "Title" field, check alternativeTitle (detail section, no subgroup)
        if (field === 'Title' && rowData.alternativeTitle) {
          if ((rowData.alternativeTitle || '').toLowerCase().includes(value)) {
            hasDetailMatch = true;
          }
        }
        
        // For "RISM / VD16 / Brown ID" field, check Brown (detail section, identifiers subgroup)
        if (field === 'RISM / VD16 / Brown ID') {
          if (checkSimpleField(rowData, 'brown', value, matchedSubgroups, 'identifiers')) {
            hasDetailMatch = true;
          }
        }
        
        // For "All fields", check all detail sections (word-by-word matching)
        if (field === 'All fields') {
          // Split value into individual words
          const words = value.split(/\s+/).filter(w => w.length > 0);
          
          // Check if any word matches in detail sections
          words.forEach(word => {
            // Check alternativeTitle (no subgroup)
            if (checkSimpleField(rowData, 'alternativeTitle', word, matchedSubgroups)) {
              hasDetailMatch = true;
            }
            
            // Check bibliography and related resources (bibliography subgroup)
            if (checkBibliographyFields(rowData, word)) {
              hasDetailMatch = true;
              matchedSubgroups.add('bibliography');
            }
            
            // Check provenance (contextual subgroup)
            if (provenanceMatches(rowData.provenance, word)) {
              hasDetailMatch = true;
              matchedSubgroups.add('contextual');
            }
            
            // Check function and codicology labels (contextual subgroup)
            if (labelArrayMatches(rowData.function, word) || labelArrayMatches(rowData.codicology, word)) {
              hasDetailMatch = true;
              matchedSubgroups.add('contextual');
            }
            
            // Check Brown (identifiers subgroup)
            if (checkSimpleField(rowData, 'brown', word, matchedSubgroups, 'identifiers')) {
              hasDetailMatch = true;
            }
          });
        }
        
        // For "Description / Comment", check nested descriptions/comments in detail sections
        if (field === 'Description / Comment') {
          // Check main description/comment (no subgroup - already in main table)
          if (checkDescriptionComment(rowData, value)) {
            hasDetailMatch = true;
          }
          
          // Check nested description/comment in provenance, function, codicology (contextual subgroup)
          if (checkNestedContextualFields(rowData, value, recordId, matchedSubgroups, badgesToActivate)) {
            hasDetailMatch = true;
          }
        }
        
        // For "Bibliography", check (detail section, bibliography subgroup)
        if (field === 'Bibliography') {
          if (checkBibliographyFields(rowData, value)) {
            hasDetailMatch = true;
            matchedSubgroups.add('bibliography');
          }
        }
      });
      
      const isShown = this.child.isShown();
      const tr = $(this.node());
      const row = this; // Keep reference to DataTables row object
      
      // Dynamically expand/collapse rows based on whether detail sections contain matches
      // This applies to all fields: Title, Place, Description/Comment, Bibliography, All fields
      // Expand if has detail match and not already shown
      if (hasDetailMatch && !isShown) {
        const chevron = this.node().cells[0];
        if (chevron) {
          chevron.click();
          // After expanding, show the matched subgroups and activate badges
          if (matchedSubgroups.size > 0) {
            setTimeout(() => {
              showSubgroupsInChildRow(row, matchedSubgroups);
              // Ensure feather icons are converted to SVG before activating badges
              feather.replace();
              // Activate badges for matched content
              if (badgesToActivate.length > 0) {
                activateMatchedBadges(badgesToActivate);
              }
            }, 150);
          }
        }
      }
      // Collapse if no detail match but currently shown (search term changed and no longer matches detail)
      else if (!hasDetailMatch && isShown) {
        const chevron = this.node().cells[0];
        if (chevron) chevron.click();
      }
      // Already shown - ensure matched subgroups are visible and badges activated
      else if (hasDetailMatch && isShown && matchedSubgroups.size > 0) {
        showSubgroupsInChildRow(row, matchedSubgroups);
        // Ensure feather icons are converted to SVG before activating badges
        feather.replace();
        // Activate badges for matched content
        if (badgesToActivate.length > 0) {
          activateMatchedBadges(badgesToActivate);
        }
      }
    });
  }

  // Helper function to activate badges for matched content
  function activateMatchedBadges(badgesToActivate) {
    badgesToActivate.forEach(({ contentId }) => {
      const $targetContent = $('#' + contentId);
      if ($targetContent.length && !$targetContent.is(':visible')) {
        const $badge = $(`.cd-badge[data-target="${contentId}"]`);
        if ($badge.length) {
          showBadgeContent($badge, $targetContent, contentId);
        }
      }
    });
  }

  // Helper function to show badge content
  function showBadgeContent($badge, $targetRow, targetId) {
    $targetRow.show();
    $badge.addClass('active');
    manuallyHiddenContent.delete(targetId);
    $badge.find('svg').replaceWith(feather.icons['minus-circle'].toSvg({
      width: 12, height: 12,
      style: 'vertical-align: -2px; margin-right: 4px;'
    }));
    $badge.closest('tr').addClass('cd-expanded');
  }

  // Helper function to hide badge content
  function hideBadgeContent($badge, $targetRow, targetId) {
    $targetRow.hide();
    $badge.removeClass('active');
    manuallyHiddenContent.add(targetId);
    $badge.find('svg').replaceWith(feather.icons['plus-circle'].toSvg({
      width: 12, height: 12,
      style: 'vertical-align: -2px; margin-right: 4px;'
    }));
    const $row = $badge.closest('tr');
    if ($row.find('.CD-content:visible').length === 0) {
      $row.removeClass('cd-expanded');
    }
  }

  function refreshOpenAltTitleHighlights() {
    table.rows({ page: 'current' }).every(function () {
      if (!this.child.isShown()) return;
      // Fully re-render the child row content with the current search term,
      // so all highlights (not just the alt-title cell) are generated fresh.
      this.child(formatDetails(this.data())).show();
    });
  }

  /* ─────────────────────────────────────────────
     DataTable initialization
     ───────────────────────────────────────────── */
  fetch('/assets/Q1.json')
    .then(response => response.json())
    .then(json => {
      const data = json['@graph'] || [];

      // Generate dynamic persons list from data
      const personsSet = new Set();
      data.forEach(row => {
        if (row.author && row.author.normalizedName) {
          personsSet.add(row.author.normalizedName);
        }
        if (row.publisher && row.publisher.normalizedName) {
          personsSet.add(row.publisher.normalizedName);
        }
      });
      DYNAMIC_PERSONS = Array.from(personsSet).sort((a, b) => a.localeCompare(b));

      // Generate dynamic places list from data
      const placesSet = new Set();
      data.forEach(row => {
        if (row.printPlace && row.printPlace.normalizedName) {
          placesSet.add(row.printPlace.normalizedName);
        }
        if (row.provenance) {
          const provenances = Array.isArray(row.provenance) ? row.provenance : [row.provenance];
          provenances.forEach(prov => {
            if (prov && prov.normalizedName) {
              placesSet.add(prov.normalizedName);
            }
          });
        }
      });
      DYNAMIC_PLACES = Array.from(placesSet).sort((a, b) => a.localeCompare(b));

      // Generate dynamic shelfmarks list from data
      // Helper function to process a single shelfmark
      const processShelfmark = (shelf, shelfmarksMap) => {
        if (!shelf || !shelf.label) return;
        
        let heading;
        if (shelf.holdingInstitution) {
          const countryCode = shelf.holdingInstitution.countryCode;
          const country = shelf.holdingInstitution.country;
          const siglum = shelf.holdingInstitution.siglum;
          
          if (countryCode && country) {
            heading = `${countryCode} — ${country}`;
          } else if (siglum) {
            heading = siglum;
          } else {
            heading = 'Other';
          }
        } else {
          heading = 'Other';
        }
        
        if (!shelfmarksMap.has(heading)) {
          shelfmarksMap.set(heading, []);
        }
        shelfmarksMap.get(heading).push(shelf.label);
      };
      
      const shelfmarksMap = new Map();
      data.forEach(row => {
        // Process main shelfmark
        if (row.shelfmark) {
          processShelfmark(row.shelfmark, shelfmarksMap);
        }
        // Process otherShelfmark (can be array or single object)
        if (row.otherShelfmark) {
          const otherShelfmarks = Array.isArray(row.otherShelfmark) ? row.otherShelfmark : [row.otherShelfmark];
          otherShelfmarks.forEach(shelf => processShelfmark(shelf, shelfmarksMap));
        }
      });
      
      // Convert map to array format and sort
      DYNAMIC_SHELFMARKS = Array.from(shelfmarksMap.entries())
        .map(([heading, chips]) => ({
          heading,
          chips: [...new Set(chips)].sort((a, b) => a.localeCompare(b))
        }))
        .sort((a, b) => {
          // Sort with 'Other' at the end
          if (a.heading === 'Other') return 1;
          if (b.heading === 'Other') return -1;
          return a.heading.localeCompare(b.heading);
        });
      
      // Render shelfmarks after generation
      renderChipGrid(document.getElementById('shelfList1'), DYNAMIC_SHELFMARKS);

      // Initialize search interface now that we have the persons, places, and shelfmarks lists
      initializeSearchInterface();

      table = $('#sourcesTable').DataTable({
        data: data,
        columns: [
          {
            className: 'dt-control',
            orderable: false,
            data: null,
            defaultContent: '',
            render: function() {
              return '<span class="chev" data-feather="chevron-right"></span>';
            }
          },
          {
            data: 'shelfmark.label',
            title: 'Shelfmark',
            defaultContent: '',
            render: function(data, type, row) {
              if (type === 'display') {
                if (row.shelfmark && row.shelfmark.url) {
                  return `<a href="${row.shelfmark.url}" target="_blank" rel="noopener noreferrer">${data}</a>`;
                }
                return data || '';
              }
              return data || '';
            }
          },
          {
            data: 'title',
            title: 'Title',
            defaultContent: '',
            render: (data, type) => renderWithHighlight(data, type, true)
          },
          {
            data: 'shortTitle',
            title: 'Short title',
            defaultContent: '',
            render: renderWithHighlight
          },
          {
            data: 'date.label',
            title: 'Dates',
            defaultContent: '',
            type: 'num',
            render: function(data, type, row) {
              if (type === 'sort') {
                if (row.date && row.date.timespan && row.date.timespan.earliestDate && row.date.timespan.earliestDate.value) {
                  return parseInt(row.date.timespan.earliestDate.value) || 0;
                }
                return 0;
              }
              if (type === 'display') return data || '';
              return data || '';
            }
          },
          {
            data: 'author.label',
            title: 'Author / Editor',
            defaultContent: '',
            render: (data, type) => renderWithHighlight(data, type, true)
          },
          {
            data: 'publisher.label',
            title: 'Publisher',
            defaultContent: '',
            render: (data, type) => renderWithHighlight(data, type, true)
          },
          {
            data: 'printPlace.label',
            title: 'Printing place',
            defaultContent: '',
            width: '120px',
            render: (data, type) => renderWithHighlight(data, type, true)
          },
          {
            data: 'rism',
            title: 'RISM',
            render: (data, type, row) => renderCombinedField(row, 'rism', 'otherRism', type)
          },
          {
            data: 'vd16',
            title: 'VD16',
            render: (data, type, row) => renderCombinedField(row, 'vd16', 'otherVD16', type)
          }
        ],
        paging: true,
        searching: true,
        info: false,
        ordering: true,
        order: [[1, 'asc']],
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]],
        dom: 'lrtp',
        stripeClasses: [],
        drawCallback: function() {
          const api = this.api();
          const totalRecords = api.page.info().recordsDisplay;
          const $lengthDiv = $('.dataTables_length');
          if ($lengthDiv.length && !$lengthDiv.parent().hasClass('length-wrapper')) {
            $lengthDiv.wrap('<div class="length-wrapper"></div>');
          }
          const $wrapper = $('.length-wrapper');
          let $recordCount = $wrapper.find('.record-count');
          if ($recordCount.length === 0) {
            $recordCount = $('<div class="record-count"></div>');
            $wrapper.append($recordCount);
          }
          $recordCount.text(totalRecords + ' Records');
        },
        initComplete: function() {
          $('#sourcesTable').css('opacity', '1');
          feather.replace();
        }
      });

      /* ── Child row helpers ── */

      function toggleChildRow(row, tr, expand) {
        if (expand) {
          row.child(formatDetails(row.data())).show();
          tr.addClass('shown');
        } else {
          row.child.hide();
          tr.removeClass('shown');
        }
        updateChevron(tr.find('td.dt-control .chev'), expand);
      }

      function applyChildTableCdClass(tr) {
        const $childTable = tr.next('.child').find('.details-table');
        if ($childTable.length) applyCdExpandedClass($childTable);
      }

      function applyAllChildTablesCdClass() {
        $('.child .details-table').each(function() { applyCdExpandedClass($(this)); });
      }

      function scheduleApplyCdClass(tr = null) {
        setTimeout(() => tr ? applyChildTableCdClass(tr) : applyAllChildTablesCdClass(), 0);
      }

      function collapseAllDetails() {
        table.rows().every(function() {
          if (this.child.isShown()) {
            const tr = $(this.node());
            this.child.hide();
            tr.removeClass('shown');
            updateChevron(tr.find('td.dt-control .chev'), false);
          }
        });
      }

      function toggleAllSubgroups(show) {
        $('.subgroup-heading-row').each(function() {
          const $row = $(this);
          const subgroup = $row.data('subgroup');
          $(`.subgroup-content[data-subgroup="${subgroup}"]`).toggle(show);
          updateChevron($row.find('.chev'), show);
        });
      }

      function toggleAllRowsAndSubgroups(expand) {
        table.rows().every(function() {
          const tr = $(this.node());
          if (expand !== this.child.isShown()) toggleChildRow(this, tr, expand);
        });
        if (expand) scheduleApplyCdClass();
        toggleAllSubgroups(expand);
      }

      /* ── Expand all rows on current page ── */
      function expandAllCurrentPageRows() {
        table.rows({ page: 'current' }).nodes().each(function(node) {
          const tr = $(node);
          const row = table.row(node);
          if (!row || row.length === 0) return;
          if (row.child.isShown()) { row.child.hide(); }
          row.child.remove();
          tr.removeClass('shown');
          const childContent = formatDetails(row.data());
          const $childTr = $('<tr class="child"><td colspan="' + tr.children('td').length + '">' + childContent + '</td></tr>');
          tr.after($childTr);
          tr.addClass('shown');
          updateChevron(tr.find('td.dt-control .chev'), true);
          row.child(childContent);
          $childTr.find('.subgroup-content').show();
        });
        scheduleApplyCdClass();
        feather.replace();
        if (isDescCommentsOpen) {
          setTimeout(function() { openAllDescCommentsOnPage(); updateToggleDescCommentsBtn(); }, 50);
        } else {
          updateToggleDescCommentsBtn();
        }
        isExpandAllActive = true;
        $('#expandCollapseBtn').text('Collapse All');
      }

      /* ── Expand/collapse button state ── */
      function updateExpandCollapseButton() {
        const $btn = $('#expandCollapseBtn');
        const visibleRows = table.rows({ search: 'applied', page: 'current' });
        const totalRows = visibleRows.count();
        let expandedRows = 0, hasCollapsedSubgroup = false;
        visibleRows.every(function() {
          if (this.child.isShown()) {
            expandedRows++;
            $(this.child()).find('.subgroup-content').each(function() {
              if (this.style.display === 'none' || window.getComputedStyle(this).display === 'none') {
                hasCollapsedSubgroup = true; return false;
              }
            });
          }
        });
        const allExpanded = totalRows > 0 && expandedRows === totalRows && !hasCollapsedSubgroup;
        $btn.text(allExpanded ? 'Collapse All' : 'Expand All');
        isExpandAllActive = allExpanded;
      }

      /* ── Draw handler (combined) ── */
      table.on('draw', function() {
        feather.replace();

        // Check if there are any active search terms
        const hasActiveSearch = getActiveRows().length > 0;
        
        // If search was cleared, collapse all rows
        if (!hasActiveSearch && isManualToggle) {
          table.rows({ page: 'current' }).every(function() {
            if (this.child.isShown()) {
              const tr = $(this.node());
              this.child.hide();
              tr.removeClass('shown');
              updateChevron(tr.find('td.dt-control .chev'), false);
            }
          });
        }
        
        // Expand detail-match rows first, then refresh highlights, then expand subgroups
        setTimeout(function() {
          if (hasActiveSearch) {
            expandAltTitleMatches();
          }
          refreshOpenAltTitleHighlights();
          // After refreshing (which regenerates HTML), expand subgroups again
          if (hasActiveSearch) {
            setTimeout(function() {
              expandAltTitleMatches();
            }, 50);
          }
        }, 0);

        const wasExpandAllActive = isExpandAllActive;
        updateExpandCollapseButton();

        // Only maintain expand-all state if there are active searches AND user didn't just make a manual change
        // Check both at the time of scheduling AND at the time of execution
        if (wasExpandAllActive && hasActiveSearch) {
          setTimeout(function() {
            // Re-check the flag at execution time in case multiple draws were queued
            if (!isManualToggle) {
              requestAnimationFrame(function() { 
                expandAllCurrentPageRows();
              });
            }
            // Reset the flag after the decision is made
            isManualToggle = false;
          }, 100);
        } else {
          // Reset the manual toggle flag with a small delay to handle rapid successive draws
          setTimeout(function() {
            isManualToggle = false;
          }, 150);
        }

        setTimeout(updateToggleDescCommentsBtn, 100);
      });

      /* ── dt-control click → open/close child row ── */
      $('#sourcesTable tbody').on('click', 'td.dt-control', function() {
        const tr = $(this).closest('tr');
        const row = table.row(tr);
        const isShown = row.child.isShown();
        toggleChildRow(row, tr, !isShown);
        if (!isShown) {
          scheduleApplyCdClass(tr);
        }
        updateExpandCollapseButton();
        setTimeout(updateToggleDescCommentsBtn, 50);
        feather.replace();
      });

      /* ── cd-badge click → toggle description/comment ── */
      $('#sourcesTable tbody').on('click', '.cd-badge', function(e) {
        isManualToggle = true;
        e.preventDefault(); e.stopPropagation();
        const targetId = $(this).data('target');
        const $targetRow = $('#' + targetId);
        const $badge = $(this);
        if ($targetRow.is(':visible')) {
          hideBadgeContent($badge, $targetRow, targetId);
        } else {
          showBadgeContent($badge, $targetRow, targetId);
        }
        updateToggleDescCommentsBtn();
        setTimeout(() => { isManualToggle = false; }, 400);
      });

      /* ── Subgroup heading click → collapse/expand ── */
      $('#sourcesTable tbody').on('click', '.heading-toggle', function(e) {
        e.stopPropagation();
        const $row = $(this).closest('.subgroup-heading-row');
        const subgroup = $row.data('subgroup');
        $row.closest('table').find('.subgroup-content[data-subgroup="' + subgroup + '"]')
          .toggle({ duration: 300, easing: 'swing' });
      });

      /* ── Buttons ── */
      $('.dataTables_length').after('<button id="expandCollapseBtn">Expand All</button><button id="toggleDescCommentsBtn">Open Descriptions/Comments</button>');

      /* ── Descriptions/Comments toggle ── */
      function hasCollapsedDescriptionBadges() {
        let found = false;
        $('#sourcesTable .cd-badge:visible:not(.active)').each(function() { found = true; return false; });
        return found;
      }

      function hasExpandedDescriptionBadges() {
        return $('#sourcesTable .cd-badge:visible.active').length > 0;
      }

      function updateToggleDescCommentsBtn() {
        const $btn = $('#toggleDescCommentsBtn');
        const hasCollapsed = hasCollapsedDescriptionBadges();
        const hasExpanded  = hasExpandedDescriptionBadges();
        if (hasCollapsed || hasExpanded) {
          $btn.addClass('visible');
          $btn.text(hasCollapsed ? 'Open Descriptions/Comments' : 'Close Descriptions/Comments');
        } else {
          $btn.removeClass('visible');
        }
      }

      function openAllDescCommentsOnPage() {
        $('#sourcesTable .cd-badge:visible:not(.active)').each(function() {
          const $badge = $(this);
          const targetId = $badge.data('target');
          const $targetRow = $('#' + targetId);
          showBadgeContent($badge, $targetRow, targetId);
        });
      }

      $('#toggleDescCommentsBtn').on('click', function() {
        const $btn = $(this);
        const isOpening = $btn.text() === 'Open Descriptions/Comments';
        $('#sourcesTable .cd-badge:visible').each(function() {
          const $badge = $(this);
          const targetId = $badge.data('target');
          const $targetRow = $('#' + targetId);
          const isActive = $badge.hasClass('active');
          if (isOpening && !isActive) {
            showBadgeContent($badge, $targetRow, targetId);
          } else if (!isOpening && isActive) {
            hideBadgeContent($badge, $targetRow, targetId);
          }
        });
        $btn.text(isOpening ? 'Close Descriptions/Comments' : 'Open Descriptions/Comments');
        isDescCommentsOpen = isOpening;
      });

      /* ── Expand/Collapse All button ── */
      $('#expandCollapseBtn').on('click', function() {
        const $btn = $(this);
        const isExpanding = $btn.text() === 'Expand All';
        toggleAllRowsAndSubgroups(isExpanding);
        $btn.text(isExpanding ? 'Collapse All' : 'Expand All');
        isExpandAllActive = isExpanding;
        feather.replace();
        setTimeout(updateToggleDescCommentsBtn, 100);
      });

    })
    .catch(error => { console.error('Error loading data:', error); });

  /* ─────────────────────────────────────────────
     Scroll-based fade effect for search box
     ───────────────────────────────────────────── */
  window.addEventListener('scroll', function() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const fadeStart = 50, fadeEnd = 150;
    let opacity;
    if (scrollTop <= fadeStart) { opacity = 1; }
    else if (scrollTop >= fadeEnd) { opacity = 0; }
    else { opacity = 1 - (scrollTop - fadeStart) / (fadeEnd - fadeStart); }
    const searchContainer = document.querySelector('.global-search-container');
    if (searchContainer) searchContainer.style.opacity = opacity;
  });

});
