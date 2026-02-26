window.addEventListener('load', function () {

  /* ─────────────────────────────────────────────
     Data constants
     ───────────────────────────────────────────── */
  const FIELDS = [
    'All fields', 'Title', 'Person', 'Place', 'RISM / VD16 / Brown ID',
    'Description / Comment', 'Bibliography'
  ];

  // Person and place lists will be dynamically populated from Q1.json
  let PERSONS = [];
  let PLACES = [];

  // Shelfmarks and functions will be dynamically populated from Q1.json
  let SHELFMARKS = [];
  let FUNCTIONS_DATA = [];

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

  function highlightText(text, term) {
    if (!text) return '';
    const str = String(text);
    const t = (term || '').trim();
    if (!t) return str; // Return original HTML content without escaping

    try {
      // Create a temporary div to parse HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = str;

      // Get plain text content (without HTML tags)
      const plainText = (tempDiv.textContent || tempDiv.innerText || '').toLowerCase();

      // Check if the search term exists as a phrase in the plain text
      if (!plainText.includes(t.toLowerCase())) {
        return str; // Term not found, return original
      }

      // Find ALL occurrences of the search term in plain text
      const searchLower = t.toLowerCase();
      const matches = [];
      let pos = 0;
      while ((pos = plainText.indexOf(searchLower, pos)) !== -1) {
        matches.push({ start: pos, end: pos + t.length });
        pos += 1; // Move forward by 1 to find overlapping matches
      }

      if (matches.length === 0) return str;

      // Now traverse the DOM and highlight all matching ranges
      let currentPos = 0;
      let matchIndex = 0;

      function highlightNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const textContent = node.textContent;
          const nodeStart = currentPos;
          const nodeEnd = currentPos + textContent.length;

          // Find all matches that overlap with this text node
          const nodeMatches = [];
          for (let i = matchIndex; i < matches.length; i++) {
            const match = matches[i];
            if (match.end <= nodeStart) {
              matchIndex = i + 1;
              continue;
            }
            if (match.start >= nodeEnd) break;
            nodeMatches.push(match);
          }

          if (nodeMatches.length > 0) {
            const span = document.createElement('span');
            let lastIndex = 0;

            nodeMatches.forEach(match => {
              const highlightStart = Math.max(0, match.start - nodeStart);
              const highlightEnd = Math.min(textContent.length, match.end - nodeStart);

              // Add text before this highlight (if any)
              if (highlightStart > lastIndex) {
                span.appendChild(document.createTextNode(textContent.substring(lastIndex, highlightStart)));
              }

              // Add highlighted portion
              const mark = document.createElement('mark');
              mark.className = 'search-highlight';
              mark.textContent = textContent.substring(highlightStart, highlightEnd);
              span.appendChild(mark);

              lastIndex = highlightEnd;
            });

            // Add remaining text after last highlight (if any)
            if (lastIndex < textContent.length) {
              span.appendChild(document.createTextNode(textContent.substring(lastIndex)));
            }

            node.parentNode.replaceChild(span, node);
          }

          currentPos = nodeEnd;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Recursively process child nodes
          Array.from(node.childNodes).forEach(highlightNode);
        }
      }

      highlightNode(tempDiv);
      return tempDiv.innerHTML;
    } catch (e) {
      return str; // Return original on error
    }
  }

  function generateSimpleRow(labelText, value, skipHighlight = false, term = undefined) {
    const displayValue = skipHighlight ? value : highlightText(value, term !== undefined ? term : getActiveTitleTerm());
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
      const titleTerm  = (getActiveTitleTerm()       || '').toLowerCase().trim();
      const descTerm   = (getActiveDescriptionTerm() || '').toLowerCase().trim();
      const hasSearchMatch = parts.some(type => {
        const content = stripHtml(item[type]).toLowerCase();
        return (descTerm && content.includes(descTerm)) || (titleTerm && content.includes(titleTerm));
      });
      const badges = parts.map(type => {
        const content = stripHtml(item[type]).toLowerCase();
        const isActive = (descTerm && content.includes(descTerm)) || (titleTerm && content.includes(titleTerm));
        const iconName = isActive ? 'minus-circle' : 'plus-circle';
        return `<span class="cd-badge${isActive ? ' active' : ''}" data-target="${recordId}-${idPrefix}-${getTypeSuffix(type)}-${index}"><i data-feather="${iconName}" style="width: 12px; height: 12px; vertical-align: -2px; margin-right: 4px;"></i>${type}</span>`;
      }).join('');
      
      // Check for Place searches (provenance), All fields, or Title matches for highlighting
      let highlightedLabel = item.label;
      let matchFound = false;
      
      // For provenance, check Place searches
      if (idPrefix === 'prov') {
        const placeSearches = getActivePlaceSearches();
        for (const search of placeSearches) {
          if (search.mode === 'list') {
            // Exact match on normalizedName
            if ((item.normalizedName || '').toLowerCase() === search.value) {
              highlightedLabel = highlightText(item.label, item.label);
              matchFound = true;
              break;
            }
          } else {
            // Partial match on label
            if (stripHtml(item.label || '').toLowerCase().includes(search.value)) {
              highlightedLabel = highlightText(item.label, search.value);
              matchFound = true;
              break;
            }
          }
        }
      }
      
      // For provenance, function, and codicology, check All fields search
      if (!matchFound && (idPrefix === 'prov' || idPrefix === 'func' || idPrefix === 'codic')) {
        const allFieldsTerm = getActiveAllFieldsTerm();
        if (allFieldsTerm && stripHtml(item.label || '').toLowerCase().includes(allFieldsTerm.toLowerCase())) {
          highlightedLabel = highlightText(item.label, allFieldsTerm);
          matchFound = true;
        }
      }
      
      // Fallback to Title search term
      if (!matchFound && titleTerm) {
        highlightedLabel = highlightText(item.label, titleTerm);
      }
      
      const rowClass = hasSearchMatch ? ' class="cd-expanded"' : '';
      rows += `<tr${rowClass}><td class="details-placeholder"></td><td class="details-label">${labelCell}</td><td class="details-value">${highlightedLabel}</td><td class="details-CD" colspan="7"><div class="cd-badges">${badges}</div>`;
      parts.forEach(type => {
        const contentId = `${recordId}-${idPrefix}-${getTypeSuffix(type)}-${index}`;
        const content = stripHtml(item[type]).toLowerCase();
        const isActive = (descTerm && content.includes(descTerm)) || (titleTerm && content.includes(titleTerm));
        const highlightTerm = descTerm || titleTerm || undefined;
        const displayStyle = manuallyHiddenContent.has(contentId) ? 'none' : (isActive ? 'block' : 'none');
        rows += `<div class="CD-content" id="${contentId}" style="display: ${displayStyle};"><div class="CD-text">${highlightText(item[type], highlightTerm)}</div></div>`;
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
    const bibTerm = getActiveBibliographyTerm() || getActiveTitleTerm();
    filtered.forEach((item, index) => {
      let valueText = item.referenceSource.bookShort || '';
      if (item.referencePages)
        valueText += ': <span class="reference-pages">' + item.referencePages + '</span>';
      rows += generateSimpleRow(getFirstLabel(index, labelText), valueText, false, bibTerm);
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
      if (row.brown) identifiersRows += generateSimpleRow('Brown:', row.brown, false, getTermForColumn('rism'));
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
        const bibTerm = getActiveBibliographyTerm() || getActiveTitleTerm();
        toArray(row.relatedResource).forEach((item, index) => {
          if (item && item.label) {
            const value = item.url
              ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.label}</a>`
              : item.label;
            bibliographyRows += generateSimpleRow(getFirstLabel(index, 'Related resources:'), value, false, bibTerm);
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

  function renderWithHighlight(data, type, removeBracket = false, term = undefined) {
    if (type === 'sort') return (removeBracket && data) ? data.replace(/^\[/, '') : (data || '');
    return (type === 'display') ? highlightText(data, term !== undefined ? term : getActiveTitleTerm()) : (data || '');
  }

  // Special render function for Place columns (printPlace) that handles list mode
  function renderPlaceColumn(data, type, row, field) {
    if (type === 'sort') return data ? data.replace(/^\[/, '') : '';
    if (type !== 'display') return data || '';
    
    // Get active Place searches and their modes
    const activePlaceSearches = [];
    builderRowsEl.querySelectorAll('.builder-row').forEach(rowEl => {
      const fieldSelect = rowEl.querySelector('.field-select');
      if (!fieldSelect || fieldSelect.value !== 'Place') return;
      const inp = rowEl.querySelector('.builder-input, .p2b-text');
      const value = inp ? inp.value.trim() : '';
      if (!value) return;
      
      // Get mode
      let mode = 'free';
      const tabsEl = rowEl.querySelector('.p2b-tabs');
      if (tabsEl) {
        const activeTab = tabsEl.querySelector('.p2b-tab.active');
        if (activeTab) mode = activeTab.dataset.mode;
      }
      activePlaceSearches.push({ value: value.toLowerCase(), mode });
    });
    
    if (activePlaceSearches.length === 0) return data || '';
    
    // Check if this row matches in list mode (exact normalizedName match)
    const placeData = row[field]; // printPlace object
    if (placeData) {
      for (const search of activePlaceSearches) {
        if (search.mode === 'list') {
          if ((placeData.normalizedName || '').toLowerCase() === search.value) {
            // Highlight the entire label
            return highlightText(data, data);
          }
        }
      }
      
      // No list mode match found, check free mode (partial label match)
      for (const search of activePlaceSearches) {
        if (search.mode === 'free') {
          if (stripHtml(data || '').toLowerCase().includes(search.value)) {
            return highlightText(data, search.value);
          }
        }
      }
    }
    
    // No match or no search term, return unhighlighted
    return data || '';
  }

  // Special render function for Person columns (author/publisher) that handles list mode
  function renderPersonColumn(data, type, row, field) {
    if (type === 'sort') return data ? data.replace(/^\[/, '') : '';
    if (type !== 'display') return data || '';
    
    // Get active Person searches and their modes
    const activePersonSearches = [];
    builderRowsEl.querySelectorAll('.builder-row').forEach(rowEl => {
      const fieldSelect = rowEl.querySelector('.field-select');
      if (!fieldSelect || fieldSelect.value !== 'Person') return;
      const inp = rowEl.querySelector('.builder-input, .p2b-text');
      const value = inp ? inp.value.trim() : '';
      if (!value) return;
      
      // Get mode
      let mode = 'free';
      const tabsEl = rowEl.querySelector('.p2b-tabs');
      if (tabsEl) {
        const activeTab = tabsEl.querySelector('.p2b-tab.active');
        if (activeTab) mode = activeTab.dataset.mode;
      }
      activePersonSearches.push({ value: value.toLowerCase(), mode });
    });
    
    if (activePersonSearches.length === 0) return data || '';
    
    // Check if this row matches in list mode (exact normalizedName match)
    const personData = row[field]; // author or publisher object
    if (personData) {
      for (const search of activePersonSearches) {
        if (search.mode === 'list') {
          if ((personData.normalizedName || '').toLowerCase() === search.value) {
            // Highlight the entire label
            return highlightText(data, data);
          }
        }
      }
      
      // No list mode match found, check free mode (partial label match)
      for (const search of activePersonSearches) {
        if (search.mode === 'free') {
          if (stripHtml(data || '').toLowerCase().includes(search.value)) {
            return highlightText(data, search.value);
          }
        }
      }
    }
    
    // No match or no search term, return unhighlighted
    return data || '';
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

  function renderCombinedField(row, primaryField, otherField, type, term) {
    if (type !== 'display') return '';
    const values = [];
    if (row[primaryField] && row[primaryField].label) {
      const h = highlightText(row[primaryField].label, term);
      values.push(row[primaryField].url
        ? `<a href="${row[primaryField].url}" target="_blank" rel="noopener noreferrer">${h}</a>`
        : h);
    }
    if (row[otherField]) {
      const items = Array.isArray(row[otherField]) ? row[otherField] : [row[otherField]];
      items.forEach(item => {
        if (item && item.label) {
          const h = highlightText(item.label, term);
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
    // renderChipGrid calls moved to after data loading (inside fetch callback)
    renderRadioList(document.getElementById('physRadioList'  + n), PHYS_RADIO_VALUES);
    renderRadioList(document.getElementById('fundaRadioList' + n), FUNDA_RADIO_VALUES);
  });

  /* ─────────────────────────────────────────────
     P2c mode-dropdown widget (Person / Place fields)
     ───────────────────────────────────────────── */
  function initModeDropdownEl(tabs, input, list, wrap, items) {
    let mode = 'free', highlighted = -1, listMemory = '';
    function showSelected(name) { 
      input.value = name; 
      input.style.display = ''; 
      input.style.fontWeight = '600'; 
      // Trigger input event to update search
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function hideInput() { 
      input.value = ''; 
      input.style.display = 'none'; 
      // Trigger input event to clear search
      input.dispatchEvent(new Event('input', { bubbles: true }));
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
        mode = tab.dataset.mode;
        if (mode === 'list') {
          input.readOnly = true; input.style.caretColor = 'transparent'; input.placeholder = '';
          if (listMemory) { showSelected(listMemory); } else { hideInput(); }
          renderList();
        } else {
          list.classList.remove('open'); input.value = ''; input.style.fontWeight = '';
          input.style.display = ''; input.readOnly = false; input.style.caretColor = '';
          input.placeholder = 'Search...';
          // Trigger input event to clear search when switching modes
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });
    wrap.addEventListener('click', () => { if (mode === 'list') renderList(); });
    input.addEventListener('keydown', e => {
      if (mode !== 'list') return;
      const its = list.querySelectorAll('.suggestion-item');
      if (e.key === 'Backspace' || e.key === 'Delete') { listMemory = ''; hideInput(); renderList(); }
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

    physTagX.addEventListener('click', () => setVal('Both'));
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

    minInput.addEventListener('input', () => { if (parseInt(minInput.value) > parseInt(maxInput.value)) minInput.value = maxInput.value; update(); });
    maxInput.addEventListener('input', () => { if (parseInt(maxInput.value) < parseInt(minInput.value)) maxInput.value = minInput.value; update(); });
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

    minLabel.addEventListener('change', () => applyLabel(minLabel, true));
    minLabel.addEventListener('blur',   () => applyLabel(minLabel, true));
    maxLabel.addEventListener('change', () => applyLabel(maxLabel, false));
    maxLabel.addEventListener('blur',   () => applyLabel(maxLabel, false));
    tagX.addEventListener('click', () => { minInput.value = minYear; maxInput.value = maxYear; update(); });
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
          x.addEventListener('click', () => { chip.classList.remove('selected'); updateTag(); });
          pill.appendChild(x); pillRow.appendChild(pill);
        });
      } else {
        tag.style.visibility = count === 0 ? 'hidden' : 'visible';
        if (count > 0) tagText.textContent = count === 1 ? '1 selected' : `${count} selected`;
      }
    }

    list.addEventListener('click', e => { const chip = e.target.closest('.sm-chip'); if (!chip) return; chip.classList.toggle('selected'); updateTag(); });
    if (!showValues) tagX.addEventListener('click', () => { list.querySelectorAll('.sm-chip.selected').forEach(c => c.classList.remove('selected')); updateTag(); });
    const resetChips = () => { list.querySelectorAll('.sm-chip.selected').forEach(c => c.classList.remove('selected')); updateTag(); };
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

    rows.forEach(r => r.addEventListener('click', () => setVal(r.dataset.val)));
    tagX.addEventListener('click', () => setVal('Both'));
    return () => setVal('Both');
  }

  /* ─────────────────────────────────────────────
     Active-state pill
     ───────────────────────────────────────────── */
  const pill = document.getElementById('searchPill');
  const pillChevron = document.getElementById('pillChevron');
  const searchToolbox = document.getElementById('searchToolbox');
  const toolboxSearchItems = document.getElementById('toolboxSearchItems');
  const toolboxFilterItems = document.getElementById('toolboxFilterItems');
  const toolboxClearBtn = document.getElementById('toolboxClearBtn');
  const toolboxSearch = document.getElementById('toolboxSearch');
  const toolboxFiltersSection = document.getElementById('toolboxFiltersSection');
  
  const pillState = { fields: 0, filters: 0, searchData: [], filterData: [] };

  function updatePill() {
    const f = pillState.fields, fi = pillState.filters;
    if (f === 0 && fi === 0) { 
      pill.classList.remove('visible'); 
      searchToolbox.classList.remove('visible');
      pillChevron.classList.remove('open');
      return; 
    }
    
    const parts = [];
    if (f  > 0) parts.push(f  === 1 ? '1 search field'  : `${f} search fields`);
    if (fi > 0) parts.push(fi === 1 ? '1 filter' : `${fi} filters`);
    
    // Update pill text - insert before the chevron
    const pillText = parts.join(' · ');
    const chevronEl = pill.querySelector('.pill-chevron');
    
    // Clear pill but keep the chevron
    pill.innerHTML = '';
    pill.appendChild(document.createTextNode(pillText));
    pill.appendChild(chevronEl);
    
    pill.classList.add('visible');
    
    // Update toolbox contents
    updateToolbox();
  }
  
  function updateToolbox() {
    // Update search items
    toolboxSearchItems.innerHTML = '';
    pillState.searchData.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'e-item';
      itemEl.innerHTML = `
        <div class="e-item-label">${item.field}: <span class="e-item-value">${item.value}</span>
          <button class="e-item-remove" title="Remove" data-row-id="${item.rowId}">
            <svg viewBox="0 0 9 9"><line x1="1" y1="1" x2="8" y2="8"/><line x1="8" y1="1" x2="1" y2="8"/></svg>
          </button>
        </div>
      `;
      toolboxSearchItems.appendChild(itemEl);
      
      // Add click handler to remove button
      itemEl.querySelector('.e-item-remove').addEventListener('click', () => {
        const row = document.querySelector(`[data-id="${item.rowId}"]`);
        if (row) {
          row.querySelector('.remove-btn')?.click();
          // Trigger input event after row removal to update table
          setTimeout(() => {
            builderRowsEl.dispatchEvent(new Event('input', { bubbles: true }));
          }, 0);
        }
      });
    });
    
    // Show/hide search section
    toolboxSearch.style.display = pillState.searchData.length > 0 ? '' : 'none';
    
    // Update filter items
    toolboxFilterItems.innerHTML = '';
    pillState.filterData.forEach(item => {
      const pillEl = document.createElement('div');
      pillEl.className = 'e-filter-pill';
      pillEl.innerHTML = `
        ${item.label}
        <span class="e-filter-pill-x" data-filter-key="${item.key}">
          <svg viewBox="0 0 8 8"><line x1="1" y1="1" x2="7" y2="7"/><line x1="7" y1="1" x2="1" y2="7"/></svg>
        </span>
      `;
      toolboxFilterItems.appendChild(pillEl);
      
      // Add click handler to remove filter
      pillEl.querySelector('.e-filter-pill-x').addEventListener('click', () => {
        if (item.clearFn) item.clearFn();
      });
    });
    
    // Show/hide filters section
    toolboxFiltersSection.style.display = pillState.filterData.length > 0 ? '' : 'none';
  }
  
  function toggleToolbox() {
    const isOpen = searchToolbox.classList.toggle('visible');
    pillChevron.classList.toggle('open', isOpen);
  }
  
  // Chevron toggle
  pillChevron.addEventListener('click', toggleToolbox);
  
  // Clear all button
  toolboxClearBtn.addEventListener('click', () => {
    // Clear all search fields
    builderRowsEl.querySelectorAll('.builder-row').forEach(row => {
      const inp = row.querySelector('.builder-input, .p2b-text');
      if (inp) inp.value = '';
      row.querySelector('.remove-btn')?.click();
    });
    
    // Clear all filters
    const clearFiltersBtn = document.getElementById('clearFiltersBtn1');
    if (clearFiltersBtn) clearFiltersBtn.click();
    
    // Close toolbox
    searchToolbox.classList.remove('visible');
    pillChevron.classList.remove('open');
    
    builderRowsEl.dispatchEvent(new Event('input'));
  });

  const builderRowsEl = document.getElementById('builderRows1');

  builderRowsEl.addEventListener('input', () => {
    let count = 0;
    const searchData = [];
    
    builderRowsEl.querySelectorAll('.builder-row').forEach(row => {
      const inp = row.querySelector('.builder-input, .p2b-text');
      const fieldSelect = row.querySelector('.field-select');
      if (inp && inp.value.trim()) {
        count++;
        searchData.push({
          field: fieldSelect ? fieldSelect.options[fieldSelect.selectedIndex].text : 'Search',
          value: inp.value.trim(),
          rowId: row.dataset.id
        });
      }
    });
    
    pillState.fields = count;
    pillState.searchData = searchData;
    updatePill();
  });

  /* ─────────────────────────────────────────────
     Initialise search interface
     ───────────────────────────────────────────── */
  let resetSearch;

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
      const filterDetails = new Map(); // Store filter details for toolbox
      
      onFilterChange = (key, isActive, label, clearFn) => {
        if (isActive) {
          activeFilters.add(key);
          if (label) filterDetails.set(key, { label, clearFn });
        } else {
          activeFilters.delete(key);
          filterDetails.delete(key);
        }
        const count = activeFilters.size;
        clearFiltersBtn.style.display = count > 0 ? '' : 'none';
        pillState.filters = count;
        pillState.filterData = Array.from(filterDetails.values()).map((v, i) => ({
          key: Array.from(filterDetails.keys())[i],
          label: v.label,
          clearFn: v.clearFn
        }));
        updatePill();
      };
    }

    const { setVal, resetSearch: rs } = setupSplitAccordion(n,
      val => {
        physRows.forEach(r => r.classList.toggle('active', r.dataset.val === val));
        if (onFilterChange) {
          const isActive = val !== 'Both';
          const label = isActive ? (val === 'Print' ? 'Print' : 'Manuscript') : null;
          onFilterChange('phys', isActive, label, () => setVal('Both'));
        }
      },
      {
        'Person': (rowId) => createModeDropdownWidget(rowId, PERSONS),
        'Place':  (rowId) => createModeDropdownWidget(rowId, PLACES)
      },
      options
    );
    resetSearch = rs;
    physRows.forEach(r => r.addEventListener('click', () => setVal(r.dataset.val)));
    const resetDate  = initDateAccordion({ n, onFilterChange: onFilterChange ? v => onFilterChange('date', v, v ? 'Date range' : null, () => resetDate()) : null });
    const resetShelf = initChipShelfmarksAccordion({ n, showValues: !!options.showChipValues, onFilterChange: onFilterChange ? v => onFilterChange('shelf', v, v ? 'Shelfmark' : null, () => resetShelf()) : null });
    const resetFn    = initChipShelfmarksAccordion({ n, prefix: 'fn', showValues: !!options.showChipValues, onFilterChange: onFilterChange ? v => onFilterChange('fn', v, v ? 'Function' : null, () => resetFn()) : null });
    const resetFunda = initFundamentaAccordion({ n, onFilterChange: onFilterChange ? v => onFilterChange('funda', v, v ? 'Fundamenta' : null, () => resetFunda()) : null });

    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => {
        setVal('Both');
        resetDate(); resetShelf(); resetFn(); resetFunda();
        document.getElementById(`filterPanel${n}`)
          .querySelectorAll('.phys-accordion.expanded')
          .forEach(a => a.classList.remove('expanded'));
      });
    }
  });

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
      if (table) { table.rows().invalidate('data'); table.draw(); }
    });
  })();

  /* ─────────────────────────────────────────────
     Search/filter logic (AND-logic between fields)
     ───────────────────────────────────────────── */
  function getActiveRows() {
    const active = [];
    builderRowsEl.querySelectorAll('.builder-row').forEach(row => {
      const field = (row.querySelector('.field-select') || {}).value || 'All fields';
      const inp   = row.querySelector('.builder-input, .p2b-text');
      const value = inp ? inp.value.trim() : '';
      // Capture the mode (free/list) for Person and Place fields
      let mode = 'free';
      const tabsEl = row.querySelector('.p2b-tabs');
      if (tabsEl) {
        const activeTab = tabsEl.querySelector('.p2b-tab.active');
        if (activeTab) mode = activeTab.dataset.mode;
      }
      if (value) active.push({ field, value: (value || '').toLowerCase(), mode });
    });
    return active;
  }

  function getActiveTitleTerm() {
    let term = '';
    builderRowsEl.querySelectorAll('.builder-row').forEach(row => {
      const field = (row.querySelector('.field-select') || {}).value || 'All fields';
      const inp   = row.querySelector('.builder-input, .p2b-text');
      const value = inp ? inp.value.trim() : '';
      if ((field === 'Title' || field === 'All fields') && value) term = value;
    });
    return term;
  }

  function getActiveDescriptionTerm() {
    let term = '';
    builderRowsEl.querySelectorAll('.builder-row').forEach(row => {
      const field = (row.querySelector('.field-select') || {}).value || 'All fields';
      const inp   = row.querySelector('.builder-input, .p2b-text');
      const value = inp ? inp.value.trim() : '';
      if ((field === 'Description / Comment' || field === 'All fields') && value) term = value;
    });
    return term;
  }

  function getActiveBibliographyTerm() {
    let term = '';
    builderRowsEl.querySelectorAll('.builder-row').forEach(row => {
      const field = (row.querySelector('.field-select') || {}).value || 'All fields';
      const inp   = row.querySelector('.builder-input, .p2b-text');
      const value = inp ? inp.value.trim() : '';
      if ((field === 'Bibliography' || field === 'All fields') && value) term = value;
    });
    return term;
  }

  function getActiveAllFieldsTerm() {
    let term = '';
    builderRowsEl.querySelectorAll('.builder-row').forEach(row => {
      const field = (row.querySelector('.field-select') || {}).value || 'All fields';
      const inp   = row.querySelector('.builder-input, .p2b-text');
      const value = inp ? inp.value.trim() : '';
      if (field === 'All fields' && value) term = value;
    });
    return term;
  }

  // Returns active Place searches with their modes
  function getActivePlaceSearches() {
    const searches = [];
    builderRowsEl.querySelectorAll('.builder-row').forEach(rowEl => {
      const fieldSelect = rowEl.querySelector('.field-select');
      if (!fieldSelect || (fieldSelect.value !== 'Place' && fieldSelect.value !== 'All fields')) return;
      const inp = rowEl.querySelector('.builder-input, .p2b-text');
      const value = inp ? inp.value.trim() : '';
      if (!value) return;
      
      // Get mode
      let mode = 'free';
      const tabsEl = rowEl.querySelector('.p2b-tabs');
      if (tabsEl) {
        const activeTab = tabsEl.querySelector('.p2b-tab.active');
        if (activeTab) mode = activeTab.dataset.mode;
      }
      searches.push({ value: value.toLowerCase(), mode });
    });
    return searches;
  }

  // Returns a highlight term only when the given column type is actually being searched.
  // Columns not covered by any active search field return ''.
  function getTermForColumn(columnType) {
    const fieldMap = {
      'title':      ['Title', 'All fields'],
      'shortTitle': ['All fields'],
      'shelfmark':  ['All fields'],
      'date':       ['All fields'],
      'author':     ['Person', 'All fields'],
      'publisher':  ['Person', 'All fields'],
      'printPlace': ['Place', 'All fields'],
      'rism':       ['RISM / VD16 / Brown ID', 'All fields'],
    };
    const allowed = fieldMap[columnType] || [];
    let term = '';
    builderRowsEl.querySelectorAll('.builder-row').forEach(row => {
      const field = (row.querySelector('.field-select') || {}).value || 'All fields';
      const inp   = row.querySelector('.builder-input, .p2b-text');
      const value = inp ? inp.value.trim() : '';
      if (value && allowed.includes(field)) term = value;
    });
    return term;
  }

  // Extract all searchable text labels from a combined field (primary object + other array/object)
  function extractLabels(row, primaryField, otherField) {
    const labels = [];
    if (row[primaryField]?.label) labels.push(row[primaryField].label);
    if (row[otherField]) {
      toArray(row[otherField]).forEach(item => { if (item?.label) labels.push(item.label); });
    }
    return labels;
  }

  function rowMatches(row, field, value, mode = 'free') {
    const matchesAny = arr => arr.some(v => stripHtml(v || '').toLowerCase().includes(value));
    const toArrR = v => !v ? [] : Array.isArray(v) ? v : [v];
    const nestedLabels = arr => toArrR(arr).map(item => item.label).filter(Boolean);
    const checkDescItems = arr => toArrR(arr).some(item =>
      stripHtml(item.description || '').toLowerCase().includes(value) ||
      stripHtml(item.comment    || '').toLowerCase().includes(value)
    );
    const nestedBibText = arr => toArrR(arr).map(item => {
      const parts = [];
      if (item.referenceSource?.bookShort) parts.push(stripHtml(item.referenceSource.bookShort));
      if (item.referencePages) parts.push(stripHtml(item.referencePages));
      if (item.label) parts.push(stripHtml(item.label));
      return parts.join(' ');
    }).filter(Boolean);
    const checkBibItems = arr => toArrR(arr).some(item =>
      stripHtml(item.referenceSource?.bookShort || '').toLowerCase().includes(value) ||
      stripHtml(item.referencePages || '').toLowerCase().includes(value) ||
      stripHtml(item.label || '').toLowerCase().includes(value)
    );
    switch (field) {
      case 'All fields':
        return matchesAny([
          row.shelfmark?.label, row.title, row.shortTitle, row.alternativeTitle,
          row.date?.label, row.author?.label, row.publisher?.label,
          row.printPlace?.label,
          ...extractLabels(row, 'rism', 'otherRism'),
          ...extractLabels(row, 'vd16', 'otherVD16'),
          row.brown, row.bibliography,
          ...nestedLabels(row.provenance),
          ...nestedLabels(row.function),
          ...nestedLabels(row.codicology),
          ...nestedBibText(row.referencedBy),
          ...nestedBibText(row.relatedResource)
        ]);
      case 'Title':
        return stripHtml(row.title || '').toLowerCase().includes(value) ||
               stripHtml(row.alternativeTitle || '').toLowerCase().includes(value);
      case 'Person':
        // If mode is 'free' (text in source), search in both author and publisher labels (partial match)
        // If mode is 'list' (from list), search in both author and publisher normalizedNames (exact match)
        if (mode === 'free') {
          return stripHtml(row.author?.label || '').toLowerCase().includes(value) ||
                 stripHtml(row.publisher?.label || '').toLowerCase().includes(value);
        } else {
          return (row.author?.normalizedName || '').toLowerCase() === value ||
                 (row.publisher?.normalizedName || '').toLowerCase() === value;
        }
      case 'Place':
        // If mode is 'free' (text in source), search in printPlace.label and provenance.label (partial match)
        // If mode is 'list' (from list), search in printPlace.normalizedName and provenance.normalizedName (exact match)
        if (mode === 'free') {
          if (stripHtml(row.printPlace?.label || '').toLowerCase().includes(value)) return true;
          // Check provenance array/object
          const provenances = Array.isArray(row.provenance) ? row.provenance : (row.provenance ? [row.provenance] : []);
          return provenances.some(prov => stripHtml(prov.label || '').toLowerCase().includes(value));
        } else {
          if ((row.printPlace?.normalizedName || '').toLowerCase() === value) return true;
          // Check provenance array/object
          const provenances = Array.isArray(row.provenance) ? row.provenance : (row.provenance ? [row.provenance] : []);
          return provenances.some(prov => (prov.normalizedName || '').toLowerCase() === value);
        }
      case 'RISM / VD16 / Brown ID':
        return matchesAny([
          ...extractLabels(row, 'rism', 'otherRism'),
          ...extractLabels(row, 'vd16', 'otherVD16'),
          row.brown
        ]);
      case 'Description / Comment':
        return stripHtml(row.description || '').toLowerCase().includes(value) ||
               stripHtml(row.comment     || '').toLowerCase().includes(value) ||
               checkDescItems(row.provenance) ||
               checkDescItems(row.function)   ||
               checkDescItems(row.codicology);
      case 'Bibliography':
        return stripHtml(row.bibliography || '').toLowerCase().includes(value) ||
               checkBibItems(row.referencedBy) ||
               checkBibItems(row.relatedResource);
      default:
        return false;
    }
  }

  $.fn.dataTable.ext.search.push(function (settings, _data, dataIndex) {
    if (settings.nTable.id !== 'sourcesTable') return true;
    if (!table) return true;
    const active = getActiveRows();
    if (active.length === 0) return true;
    const rowData = table.row(dataIndex).data();
    if (!rowData) return true;
    return active.every(({ field, value, mode }) => rowMatches(rowData, field, value, mode));
  });

  /* ─────────────────────────────────────────────
     Post-draw highlighting
     ───────────────────────────────────────────── */

  // Collapse rows that were expanded due to nested matches but no longer match the current search
  function collapseNonMatchingRows() {
    const active = getActiveRows();
    if (active.length === 0) return;

    const titleTerms = active.filter(r => r.field === 'Title' || r.field === 'All fields');
    const rismTerms = active.filter(r => r.field === 'RISM / VD16 / Brown ID' || r.field === 'All fields');
    const descTerms = active.filter(r => r.field === 'Description / Comment' || r.field === 'All fields');
    const bibTerms = active.filter(r => r.field === 'Bibliography' || r.field === 'All fields');
    const placeSearches = getActivePlaceSearches();

    table.rows({ page: 'current' }).every(function () {
      if (!this.child.isShown()) return;
      const rowData = this.data();
      if (!rowData) return;

      let shouldKeepExpanded = false;

      // Check if row has alternativeTitle match
      if (titleTerms.length > 0 && rowData.alternativeTitle) {
        const hasAltMatch = titleTerms.some(({ value }) => 
          stripHtml(rowData.alternativeTitle || '').toLowerCase().includes(value)
        );
        if (hasAltMatch) shouldKeepExpanded = true;
      }

      // Check if row has brown match
      if (!shouldKeepExpanded && rismTerms.length > 0 && rowData.brown) {
        const hasBrownMatch = rismTerms.some(({ value }) => 
          stripHtml(rowData.brown || '').toLowerCase().includes(value)
        );
        if (hasBrownMatch) shouldKeepExpanded = true;
      }

      // Check if row has description/comment match in nested fields
      if (!shouldKeepExpanded && descTerms.length > 0) {
        const toArr = v => !v ? [] : Array.isArray(v) ? v : [v];
        const checkItems = (arr, term) => toArr(arr).some(item =>
          (stripHtml(item.description || '').toLowerCase().includes(term)) ||
          (stripHtml(item.comment || '').toLowerCase().includes(term))
        );
        const hasDescMatch = descTerms.some(({ value }) =>
          stripHtml(rowData.description || '').toLowerCase().includes(value) ||
          stripHtml(rowData.comment || '').toLowerCase().includes(value) ||
          checkItems(rowData.provenance, value) ||
          checkItems(rowData.function, value) ||
          checkItems(rowData.codicology, value)
        );
        if (hasDescMatch) shouldKeepExpanded = true;
      }

      // Check if row has bibliography match
      if (!shouldKeepExpanded && bibTerms.length > 0) {
        const toArr = v => !v ? [] : Array.isArray(v) ? v : [v];
        const checkBibItems = (arr, term) => toArr(arr).some(item =>
          stripHtml(item.referenceSource?.bookShort || '').toLowerCase().includes(term) ||
          stripHtml(item.referencePages || '').toLowerCase().includes(term) ||
          stripHtml(item.label || '').toLowerCase().includes(term)
        );
        const hasBibMatch = bibTerms.some(({ value }) =>
          checkBibItems(rowData.referencedBy, value) || checkBibItems(rowData.relatedResource, value)
        );
        if (hasBibMatch) shouldKeepExpanded = true;
      }

      // Check if row has place match in provenance
      if (!shouldKeepExpanded && placeSearches.length > 0) {
        const toArr = v => !v ? [] : Array.isArray(v) ? v : [v];
        const hasPlaceMatch = toArr(rowData.provenance).some(item => {
          for (const search of placeSearches) {
            if (search.mode === 'list') {
              if ((item.normalizedName || '').toLowerCase() === search.value) return true;
            } else {
              if (stripHtml(item.label || '').toLowerCase().includes(search.value)) return true;
            }
          }
          return false;
        });
        if (hasPlaceMatch) shouldKeepExpanded = true;
      }

      // Check if row has All fields match in nested labels (provenance, function, codicology)
      if (!shouldKeepExpanded) {
        const allFieldsTerm = getActiveAllFieldsTerm();
        if (allFieldsTerm) {
          const value = allFieldsTerm.toLowerCase();
          const toArr = v => !v ? [] : Array.isArray(v) ? v : [v];
          const hasNestedMatch = 
            toArr(rowData.provenance).some(item => stripHtml(item.label || '').toLowerCase().includes(value)) ||
            toArr(rowData.function).some(item => stripHtml(item.label || '').toLowerCase().includes(value)) ||
            toArr(rowData.codicology).some(item => stripHtml(item.label || '').toLowerCase().includes(value));
          if (hasNestedMatch) shouldKeepExpanded = true;
        }
      }

      // If no match found, collapse the row
      if (!shouldKeepExpanded) {
        const chevron = this.node().cells[0];
        if (chevron) chevron.click();
      }
    });
  }

  // Expand child rows whose match is only in alternativeTitle.
  // Uses a native DOM click on cells[0] (the dt-control chevron column) —
  // a real browser event that bubbles and reliably triggers the delegated click handler.
  function expandAltTitleMatches() {
    const active = getActiveRows();
    const titleTerms = active.filter(r => r.field === 'Title' || r.field === 'All fields');
    if (titleTerms.length === 0) return;
    table.rows({ page: 'current' }).every(function () {
      const rowData = this.data();
      if (!rowData || !rowData.alternativeTitle) return;
      if (this.child.isShown()) return;
      const hasAltMatch = titleTerms.some(({ value }) => stripHtml(rowData.alternativeTitle || '').toLowerCase().includes(value));
      if (hasAltMatch) {
        const chevron = this.node().cells[0];
        if (chevron) chevron.click();
      }
    });
  }

  // Expand child rows that have a matching description or comment.
  function expandDescriptionMatches() {
    const active = getActiveRows();
    const descTerms = active.filter(r => r.field === 'Description / Comment' || r.field === 'All fields');
    if (descTerms.length === 0) return;
    table.rows({ page: 'current' }).every(function () {
      const rowData = this.data();
      if (!rowData) return;
      if (this.child.isShown()) return;
      const hasDescMatch = descTerms.some(({ value }) => {
        // Check top-level description/comment
        if (stripHtml(rowData.description || '').toLowerCase().includes(value)) return true;
        if (stripHtml(rowData.comment || '').toLowerCase().includes(value)) return true;
        // Check nested items (provenance, function, codicology)
        const checkItems = (arr) => (arr || []).some(item =>
          (stripHtml(item.description || '').toLowerCase().includes(value)) ||
          (stripHtml(item.comment || '').toLowerCase().includes(value))
        );
        const toArr = v => !v ? [] : Array.isArray(v) ? v : [v];
        return checkItems(toArr(rowData.provenance)) ||
               checkItems(toArr(rowData.function)) ||
               checkItems(toArr(rowData.codicology));
      });
      if (hasDescMatch) {
        const chevron = this.node().cells[0];
        if (chevron) chevron.click();
      }
    });
  }

  // Expand child rows that have a matching bibliography or related resource.
  function expandBibliographyMatches() {
    const active = getActiveRows();
    const bibTerms = active.filter(r => r.field === 'Bibliography' || r.field === 'All fields');
    if (bibTerms.length === 0) return;
    table.rows({ page: 'current' }).every(function () {
      const rowData = this.data();
      if (!rowData) return;
      if (this.child.isShown()) return;
      const hasBibMatch = bibTerms.some(({ value }) => {
        const checkBibItems = arr => {
          const toArr = v => !v ? [] : Array.isArray(v) ? v : [v];
          return toArr(arr).some(item =>
            stripHtml(item.referenceSource?.bookShort || '').toLowerCase().includes(value) ||
            stripHtml(item.referencePages || '').toLowerCase().includes(value) ||
            stripHtml(item.label || '').toLowerCase().includes(value)
          );
        };
        return checkBibItems(rowData.referencedBy) || checkBibItems(rowData.relatedResource);
      });
      if (hasBibMatch) {
        const chevron = this.node().cells[0];
        if (chevron) chevron.click();
      }
    });
  }

  // Expand child rows that have a matching place in provenance.
  function expandPlaceMatches() {
    const placeSearches = getActivePlaceSearches();
    if (placeSearches.length === 0) return;
    table.rows({ page: 'current' }).every(function () {
      const rowData = this.data();
      if (!rowData) return;
      if (this.child.isShown()) return;
      // Check if provenance items match any place search
      const toArr = v => !v ? [] : Array.isArray(v) ? v : [v];
      const hasPlaceMatch = toArr(rowData.provenance).some(item => {
        for (const search of placeSearches) {
          if (search.mode === 'list') {
            // Exact match on normalizedName
            if ((item.normalizedName || '').toLowerCase() === search.value) return true;
          } else {
            // Partial match on label
            if (stripHtml(item.label || '').toLowerCase().includes(search.value)) return true;
          }
        }
        return false;
      });
      if (hasPlaceMatch) {
        const chevron = this.node().cells[0];
        if (chevron) chevron.click();
      }
    });
  }

  // Expand child rows that have All fields matches in provenance, function, or codicology labels.
  function expandAllFieldsMatches() {
    const allFieldsTerm = getActiveAllFieldsTerm();
    if (!allFieldsTerm) return;
    const value = allFieldsTerm.toLowerCase();
    table.rows({ page: 'current' }).every(function () {
      const rowData = this.data();
      if (!rowData) return;
      if (this.child.isShown()) return;
      // Check if provenance, function, or codicology labels match
      const toArr = v => !v ? [] : Array.isArray(v) ? v : [v];
      const hasMatch = 
        toArr(rowData.provenance).some(item => stripHtml(item.label || '').toLowerCase().includes(value)) ||
        toArr(rowData.function).some(item => stripHtml(item.label || '').toLowerCase().includes(value)) ||
        toArr(rowData.codicology).some(item => stripHtml(item.label || '').toLowerCase().includes(value));
      if (hasMatch) {
        const chevron = this.node().cells[0];
        if (chevron) chevron.click();
      }
    });
  }

  // Expand child rows whose match is only in brown (Further Identifiers subtable).
  function expandBrownMatches() {
    const active = getActiveRows();
    const rismTerms = active.filter(r => r.field === 'RISM / VD16 / Brown ID' || r.field === 'All fields');
    if (rismTerms.length === 0) return;
    table.rows({ page: 'current' }).every(function () {
      const rowData = this.data();
      if (!rowData || !rowData.brown) return;
      if (this.child.isShown()) return;
      const hasBrownMatch = rismTerms.some(({ value }) => stripHtml(rowData.brown || '').toLowerCase().includes(value));
      if (hasBrownMatch) {
        const chevron = this.node().cells[0];
        if (chevron) chevron.click();
      }
    });
  }

  function refreshOpenAltTitleHighlights() {
    const active = getActiveRows();
    const rismTerms = active.filter(r => r.field === 'RISM / VD16 / Brown ID' || r.field === 'All fields');
    const descTerms = active.filter(r => r.field === 'Description / Comment' || r.field === 'All fields');
    const bibTerms = active.filter(r => r.field === 'Bibliography' || r.field === 'All fields');
    table.rows({ page: 'current' }).every(function () {
      if (!this.child.isShown()) return;
      // Fully re-render the child row content with the current search term,
      // so all highlights (not just the alt-title cell) are generated fresh.
      this.child(formatDetails(this.data())).show();
      // If this row has a brown match, expand the Further Identifiers subgroup.
      const rowData = this.data();
      if (rismTerms.length > 0 && rowData.brown) {
        const hasBrownMatch = rismTerms.some(({ value }) => stripHtml(rowData.brown || '').toLowerCase().includes(value));
        if (hasBrownMatch) {
          const $child = this.child();
          if ($child && $child.length) {
            $child.find('.subgroup-content[data-subgroup="identifiers"]').show();
          }
        }
      }
      // If this row has a description/comment match, expand the Contextual Metadata subgroup.
      if (descTerms.length > 0) {
        const toArr = v => !v ? [] : Array.isArray(v) ? v : [v];
        const checkItems = (arr, term) => toArr(arr).some(item =>
          (stripHtml(item.description || '').toLowerCase().includes(term)) ||
          (stripHtml(item.comment || '').toLowerCase().includes(term))
        );
        const hasDescMatch = descTerms.some(({ value }) =>
          stripHtml(rowData.description || '').toLowerCase().includes(value) ||
          stripHtml(rowData.comment || '').toLowerCase().includes(value) ||
          checkItems(rowData.provenance, value) ||
          checkItems(rowData.function, value) ||
          checkItems(rowData.codicology, value)
        );
        if (hasDescMatch) {
          const $child = this.child();
          if ($child && $child.length) {
            $child.find('.subgroup-content[data-subgroup="contextual"]').show();
          }
        }
      }
      // If this row has a place match in provenance, expand the Contextual Metadata subgroup.
      const placeSearches = getActivePlaceSearches();
      if (placeSearches.length > 0) {
        const toArr = v => !v ? [] : Array.isArray(v) ? v : [v];
        const checkPlaceItems = (arr, searches) => toArr(arr).some(item => {
          for (const search of searches) {
            if (search.mode === 'list') {
              // Exact match on normalizedName
              if ((item.normalizedName || '').toLowerCase() === search.value) return true;
            } else {
              // Partial match on label
              if (stripHtml(item.label || '').toLowerCase().includes(search.value)) return true;
            }
          }
          return false;
        });
        const hasPlaceMatch = checkPlaceItems(rowData.provenance, placeSearches);
        if (hasPlaceMatch) {
          const $child = this.child();
          if ($child && $child.length) {
            $child.find('.subgroup-content[data-subgroup="contextual"]').show();
          }
        }
      }
      // If this row has All fields match in provenance/function/codicology labels, expand Contextual Metadata.
      const allFieldsTerm = getActiveAllFieldsTerm();
      if (allFieldsTerm) {
        const value = allFieldsTerm.toLowerCase();
        const toArr = v => !v ? [] : Array.isArray(v) ? v : [v];
        const hasNestedMatch = 
          toArr(rowData.provenance).some(item => stripHtml(item.label || '').toLowerCase().includes(value)) ||
          toArr(rowData.function).some(item => stripHtml(item.label || '').toLowerCase().includes(value)) ||
          toArr(rowData.codicology).some(item => stripHtml(item.label || '').toLowerCase().includes(value));
        if (hasNestedMatch) {
          const $child = this.child();
          if ($child && $child.length) {
            $child.find('.subgroup-content[data-subgroup="contextual"]').show();
          }
        }
      }
      // If this row has a bibliography/related resource match, expand the Bibliography subgroup.
      if (bibTerms.length > 0) {
        const toArr = v => !v ? [] : Array.isArray(v) ? v : [v];
        const checkBibItems = (arr, term) => toArr(arr).some(item =>
          stripHtml(item.referenceSource?.bookShort || '').toLowerCase().includes(term) ||
          stripHtml(item.referencePages || '').toLowerCase().includes(term) ||
          stripHtml(item.label || '').toLowerCase().includes(term)
        );
        const hasBibMatch = bibTerms.some(({ value }) =>
          checkBibItems(rowData.referencedBy, value) ||
          checkBibItems(rowData.relatedResource, value)
        );
        if (hasBibMatch) {
          const $child = this.child();
          if ($child && $child.length) {
            $child.find('.subgroup-content[data-subgroup="bibliography"]').show();
          }
        }
      }
    });
  }

  // Wire search builder inputs to DataTable draws
  builderRowsEl.addEventListener('input',  () => { 
    if (table) {
      table.rows().invalidate('data');
      table.draw();
    }
  });
  builderRowsEl.addEventListener('change', () => { 
    if (table) {
      table.rows().invalidate('data');
      table.draw();
    }
  });
  builderRowsEl.addEventListener('click',  e => {
    if (e.target.closest('.remove-btn')) {
      setTimeout(() => {
        if (table) {
          table.rows().invalidate('data');
          table.draw();
        }
      }, 0);
    }
  });

  /* ─────────────────────────────────────────────
     DataTable initialization
     ───────────────────────────────────────────── */
  fetch('/assets/Q1.json')
    .then(response => response.json())
    .then(json => {
      const data = json['@graph'] || [];

      // Extract unique person normalizedNames from author and publisher fields
      const personNamesSet = new Set();
      data.forEach(row => {
        if (row.author?.normalizedName) personNamesSet.add(row.author.normalizedName);
        if (row.publisher?.normalizedName) personNamesSet.add(row.publisher.normalizedName);
      });
      PERSONS = Array.from(personNamesSet).sort();

      // Extract unique place normalizedNames from printPlace and provenance fields
      const placeNamesSet = new Set();
      data.forEach(row => {
        if (row.printPlace?.normalizedName) placeNamesSet.add(row.printPlace.normalizedName);
        if (row.provenance) {
          const provenances = Array.isArray(row.provenance) ? row.provenance : [row.provenance];
          provenances.forEach(prov => {
            if (prov?.normalizedName) placeNamesSet.add(prov.normalizedName);
          });
        }
      });
      PLACES = Array.from(placeNamesSet).sort();

      // Extract unique function labels
      const functionLabelsSet = new Set();
      data.forEach(row => {
        if (row.function) {
          const functions = Array.isArray(row.function) ? row.function : [row.function];
          functions.forEach(func => {
            if (func?.label) functionLabelsSet.add(func.label);
          });
        }
      });
      FUNCTIONS_DATA = Array.from(functionLabelsSet).sort();
      // Add the special '[empty field]' option at the end
      FUNCTIONS_DATA.push({ label: '[empty field]', cls: 'sm-chip--grey' });

      // Extract and group shelfmark labels by country/siglum
      const shelfmarksByGroup = new Map();
      const countryNames = new Map(); // Map country code to country name
      
      data.forEach(row => {
        // Process main shelfmark
        if (row.shelfmark?.label && row.shelfmark?.holdingInstitution) {
          const inst = row.shelfmark.holdingInstitution;
          const groupKey = inst.countryCode || inst.siglum;
          if (groupKey) {
            if (!shelfmarksByGroup.has(groupKey)) {
              shelfmarksByGroup.set(groupKey, new Set());
            }
            shelfmarksByGroup.get(groupKey).add(row.shelfmark.label);
            // Store country name for heading
            if (inst.country && inst.countryCode) {
              countryNames.set(inst.countryCode, inst.country);
            }
          }
        }
        
        // Process otherShelfmark (can be object or array)
        if (row.otherShelfmark) {
          const otherShelfmarks = Array.isArray(row.otherShelfmark) ? row.otherShelfmark : [row.otherShelfmark];
          otherShelfmarks.forEach(other => {
            if (other?.label && other?.holdingInstitution) {
              const inst = other.holdingInstitution;
              const groupKey = inst.countryCode || inst.siglum;
              if (groupKey) {
                if (!shelfmarksByGroup.has(groupKey)) {
                  shelfmarksByGroup.set(groupKey, new Set());
                }
                shelfmarksByGroup.get(groupKey).add(other.label);
                // Store country name for heading
                if (inst.country && inst.countryCode) {
                  countryNames.set(inst.countryCode, inst.country);
                }
              }
            }
          });
        }
      });

      // Convert to array format with headings
      SHELFMARKS = Array.from(shelfmarksByGroup.entries())
        .map(([key, labelsSet]) => {
          const chips = Array.from(labelsSet).sort();
          let heading = key;
          // Format heading with country name if available
          if (countryNames.has(key)) {
            heading = `${key} — ${countryNames.get(key)}`;
          }
          return { heading, chips };
        })
        .sort((a, b) => a.heading.localeCompare(b.heading));

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
                const highlighted = highlightText(data, getTermForColumn('shelfmark'));
                if (row.shelfmark && row.shelfmark.url) {
                  return `<a href="${row.shelfmark.url}" target="_blank" rel="noopener noreferrer">${highlighted}</a>`;
                }
                return highlighted;
              }
              return data || '';
            }
          },
          {
            data: 'title',
            title: 'Title',
            defaultContent: '',
            render: (data, type) => renderWithHighlight(data, type, true, getTermForColumn('title'))
          },
          {
            data: 'shortTitle',
            title: 'Short title',
            defaultContent: '',
            render: (data, type) => renderWithHighlight(data, type, false, getTermForColumn('shortTitle'))
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
              if (type === 'display') return highlightText(data, getTermForColumn('date'));
              return data || '';
            }
          },
          {
            data: 'author.label',
            title: 'Author / Editor',
            defaultContent: '',
            render: (data, type, row) => renderPersonColumn(data, type, row, 'author')
          },
          {
            data: 'publisher.label',
            title: 'Publisher',
            defaultContent: '',
            render: (data, type, row) => renderPersonColumn(data, type, row, 'publisher')
          },
          {
            data: 'printPlace.label',
            title: 'Printing place',
            defaultContent: '',
            width: '120px',
            render: (data, type, row) => renderPlaceColumn(data, type, row, 'printPlace')
          },
          {
            data: 'rism',
            title: 'RISM',
            render: (data, type, row) => renderCombinedField(row, 'rism', 'otherRism', type, getTermForColumn('rism'))
          },
          {
            data: 'vd16',
            title: 'VD16',
            render: (data, type, row) => renderCombinedField(row, 'vd16', 'otherVD16', type, getTermForColumn('rism'))
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

      // Now that data is loaded, render the chip grids with dynamic data
      [1].forEach(n => {
        renderChipGrid(document.getElementById('shelfList' + n), SHELFMARKS);
        renderChipGrid(document.getElementById('fnList'    + n), FUNCTIONS_DATA);
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

        // Collapse non-matching rows first, then expand matching rows and refresh highlights
        setTimeout(function() {
          collapseNonMatchingRows();
          expandAltTitleMatches();
          expandBrownMatches();
          expandDescriptionMatches();
          expandBibliographyMatches();
          expandPlaceMatches();
          expandAllFieldsMatches();
          refreshOpenAltTitleHighlights();
          feather.replace();
        }, 0);

        const wasExpandAllActive = isExpandAllActive;
        updateExpandCollapseButton();

        if (wasExpandAllActive && !isManualToggle) {
          setTimeout(function() {
            requestAnimationFrame(function() { expandAllCurrentPageRows(); });
          }, 100);
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
        const $row = $(this).closest('tr');
        const $badge = $(this);
        if ($targetRow.is(':visible')) {
          $targetRow.hide(); $badge.removeClass('active');
          if (targetId) manuallyHiddenContent.add(targetId);
          $badge.find('svg').replaceWith(feather.icons['plus-circle'].toSvg({ width: 12, height: 12, style: 'vertical-align: -2px; margin-right: 4px;' }));
          if ($row.find('.CD-content:visible').length === 0) $row.removeClass('cd-expanded');
        } else {
          $targetRow.show(); $badge.addClass('active');
          manuallyHiddenContent.delete(targetId);
          $badge.find('svg').replaceWith(feather.icons['minus-circle'].toSvg({ width: 12, height: 12, style: 'vertical-align: -2px; margin-right: 4px;' }));
          $row.addClass('cd-expanded');
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
          $targetRow.show(); $badge.addClass('active');
          manuallyHiddenContent.delete(targetId);
          $badge.find('svg').replaceWith(feather.icons['minus-circle'].toSvg({ width: 12, height: 12, style: 'vertical-align: -2px; margin-right: 4px;' }));
          $badge.closest('tr').addClass('cd-expanded');
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
            $targetRow.show(); $badge.addClass('active');
            manuallyHiddenContent.delete(targetId);
            $badge.find('svg').replaceWith(feather.icons['minus-circle'].toSvg({ width: 12, height: 12, style: 'vertical-align: -2px; margin-right: 4px;' }));
            $badge.closest('tr').addClass('cd-expanded');
          } else if (!isOpening && isActive) {
            $targetRow.hide(); $badge.removeClass('active');
            manuallyHiddenContent.add(targetId);
            $badge.find('svg').replaceWith(feather.icons['plus-circle'].toSvg({ width: 12, height: 12, style: 'vertical-align: -2px; margin-right: 4px;' }));
            const $row = $badge.closest('tr');
            if ($row.find('.CD-content:visible').length === 0) $row.removeClass('cd-expanded');
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
