$(document).ready(function() {
  // Track manually hidden content
  const manuallyHiddenContent = new Set();
  let isManualToggle = false; // Flag to prevent search handler interference
  // lastSearchValue will be initialized from URL params after they're read

  // Function to update URL parameters
  function updateUrlParams(search, filters) {
    const params = new URLSearchParams();

    if (search && search.trim()) {
      params.set('search', search.trim());
    }

    if (filters.minDate !== 1450 || filters.maxDate !== 1620) {
      params.set('minDate', filters.minDate);
      params.set('maxDate', filters.maxDate);
    }

    if (filters.physicalType && filters.physicalType !== 'both') {
      params.set('physicalType', filters.physicalType);
    }

    if (filters.fundamenta && filters.fundamenta !== 'both') {
      params.set('fundamenta', filters.fundamenta);
    }

    // Add logic modes (only if OR - AND is the default)
    if (filters.personsLogic === true) {
      params.set('personsLogic', 'or');
    }
    if (filters.placesLogic === true) {
      params.set('placesLogic', 'or');
    }
    if (filters.functionsLogic === true) {
      params.set('functionsLogic', 'or');
    }
    // shelfmarksLogic is always OR, no need to store in URL

    // Add multi-select filters
    const URL_PARAM_MAPPINGS = [
      { filter: 'shortTitles', param: 'shortTitle' },
      { filter: 'persons', param: 'person' },
      { filter: 'places', param: 'place' },
      { filter: 'functions', param: 'function' },
      { filter: 'shelfmarks', param: 'shelfmark' }
    ];

    URL_PARAM_MAPPINGS.forEach(({ filter, param }) => {
      if (filters[filter] && filters[filter].length > 0) {
        filters[filter].forEach(value => params.append(param, value));
      }
    });

    const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }

  // Helper to get current filters state
  const FILTER_SETS = {
    shortTitles: () => selectedShortTitles,
    persons: () => selectedPersons,
    places: () => selectedPlaces,
    functions: () => selectedFunctions,
    shelfmarks: () => selectedShelfmarks
  };

  function getCurrentFilters() {
    const filters = {
      minDate: minDate,
      maxDate: maxDate,
      physicalType: physicalTypeFilter,
      fundamenta: fundamentaFilter,
      personsLogic: personsLogic,
      placesLogic: placesLogic,
      functionsLogic: functionsLogic
    };

    Object.entries(FILTER_SETS).forEach(([key, getSet]) => {
      filters[key] = Array.from(getSet());
    });

    return filters;
  }

  // Helper to parse logic parameter from URL (default is AND=false)
  function parseLogicParam(params, paramName) {
    return params.get(paramName) === 'or';
  }

  // Function to read URL parameters
  function readUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      search: params.get('search') || '',
      minDate: params.get('minDate') ? parseInt(params.get('minDate'), 10) : 1450,
      maxDate: params.get('maxDate') ? parseInt(params.get('maxDate'), 10) : 1620,
      physicalType: params.get('physicalType') || 'both',
      fundamenta: params.get('fundamenta') || 'both',
      personsLogic: parseLogicParam(params, 'personsLogic'),
      placesLogic: parseLogicParam(params, 'placesLogic'),
      functionsLogic: parseLogicParam(params, 'functionsLogic'),
      shortTitles: params.getAll('shortTitle'),
      persons: params.getAll('person'),
      places: params.getAll('place'),
      functions: params.getAll('function'),
      shelfmarks: params.getAll('shelfmark')
    };
  }

  // Function to get column widths from main table
  function getColumnWidths() {
    const widths = [];

    // Get widths from tbody cells - only first 3 columns
    const $firstRow = $('#sourcesTable tbody tr:not(.child):first td');

    if ($firstRow.length > 0) {
      $firstRow.slice(0, 3).each(function() {
        widths.push($(this).outerWidth() + 'px');
      });
    } else {
      // Fallback to thead if no tbody rows
      $('#sourcesTable thead th').slice(0, 3).each(function() {
        widths.push($(this).outerWidth() + 'px');
      });
    }

    return widths;
  }

  // Function to generate a simple detail row
  function generateSimpleRow(labelText, value, skipHighlight = false) {
    const displayValue = skipHighlight ? value : highlightText(value, currentSearchTerm);
    return '<tr><td class="details-placeholder"></td><td class="details-label">' + labelText + '</td><td class="details-value">' + displayValue + '</td><td class="details-CD" colspan="7"></td></tr>';
  }

  // Function to generate contextual metadata rows (provenance, function, codicology)
  function generateSubtableRows(data, labelText, idPrefix, recordId = '') {
    let rows = '';
    if (!data) return rows;

    const items = toArray(data);

    items.forEach((item, index) => {
      if (item.label) {
        const labelCell = getFirstLabel(index, labelText);
        const parts = ['description', 'comment'].filter(type => item[type]);
        
        // Check if search term exists in description or comment
        const searchTerm = normalizeUmlauts(currentSearchTerm.toLowerCase().trim());
        const hasSearchMatch = searchTerm && parts.some(type => {
          const text = normalizeUmlauts(stripHtml(item[type]).toLowerCase());
          return text.includes(searchTerm);
        });
        
        // Generate badges with active class if match found
        const badges = parts.map(type => {
          const text = normalizeUmlauts(stripHtml(item[type]).toLowerCase());
          const isActive = searchTerm && text.includes(searchTerm);
          const iconName = isActive ? 'minus-circle' : 'plus-circle';
          return `<span class="cd-badge${isActive ? ' active' : ''}" data-target="${recordId}-${idPrefix}-${getTypeSuffix(type)}-${index}"><i data-feather="${iconName}" style="width: 12px; height: 12px; vertical-align: -2px; margin-right: 4px;"></i>${type}</span>`;
        }).join('');

        const highlightedLabel = highlightText(item.label, currentSearchTerm);
        const rowClass = hasSearchMatch ? ' class="cd-expanded"' : '';
        rows += `<tr${rowClass}><td class="details-placeholder"></td><td class="details-label">` + labelCell + '</td><td class="details-value">' + highlightedLabel + '</td><td class="details-CD" colspan="7"><div class="cd-badges">' + badges + '</div>';

        // Add expandable content for each part, auto-expanded if search match
        parts.forEach(type => {
          const text = normalizeUmlauts(stripHtml(item[type]).toLowerCase());
          const contentId = `${recordId}-${idPrefix}-${getTypeSuffix(type)}-${index}`;
          const isActive = searchTerm && text.includes(searchTerm);
          const displayStyle = manuallyHiddenContent.has(contentId) ? 'none' : (isActive ? 'block' : 'none');
          const highlightedText = highlightText(item[type], currentSearchTerm);
          rows += `<div class="CD-content" id="${contentId}" style="display: ${displayStyle};"><div class="CD-text">${highlightedText}</div></div>`;
        });

        rows += '</td></tr>';
      }
    });

    return rows;
  }

  // Helper to generate bibliography rows by type
  function generateBibliographyRows(items, labelText, typeFilter) {
    let rows = '';
    const filtered = items.filter(item => {
      if (!item.referenceSource) return false;
      if (typeFilter === null) {
        // For 'Other bibliography', exclude Edition and Catalogue
        return item.referenceSource.referencebookType !== 'Edition' &&
               item.referenceSource.referencebookType !== 'Catalogue';
      }
      return item.referenceSource.referencebookType === typeFilter;
    });

    if (filtered.length > 0) {
      filtered.forEach((item, index) => {
        let valueText = item.referenceSource.bookShort || '';
        if (item.referencePages) {
          valueText += ': <span class="reference-pages">' + item.referencePages + '</span>';
        }
        rows += generateSimpleRow(getFirstLabel(index, labelText), valueText);
      });
    }

    return rows;
  }

  // Helper to wrap row(s) in subgroup class
  function wrapInSubgroup(rowHtml, subgroup, replaceAll = false) {
    // Pattern to match both <tr> and <tr class="...">
    const pattern = replaceAll ? /<tr(?:\s+class="([^"]*)")?\s*>/g : /<tr(?:\s+class="([^"]*)")?\s*>/;

    return rowHtml.replace(pattern, (match, existingClasses) => {
      const classes = existingClasses ? `subgroup-content ${existingClasses}` : 'subgroup-content';
      return `<tr class="${classes}" data-subgroup="${subgroup}" style="display:none">`;
    });
  }

  // Helper to generate subgroup heading row
  function generateSubgroupHeading(title, subgroup) {
    return `<tr class="subgroup-heading-row" data-subgroup="${subgroup}"><td class="details-placeholder"></td><td colspan="9" class="details-heading"><span class="heading-toggle">${title}</span></td></tr>`;
  }

  // Helper to generate spacer row
  function generateSpacerRow(subgroup = null, small = false) {
    const className = small ? 'subgroup-spacer-small' : 'subgroup-spacer';
    const subgroupAttr = subgroup ? ` subgroup-content" data-subgroup="${subgroup}" style="display:none` : '';
    return `<tr class="${className}${subgroupAttr}"><td colspan="10"></td></tr>`;
  }

  // Helper to normalize to array
  function toArray(val) {
    return Array.isArray(val) ? val : [val];
  }

  // Helper to update chevron icon
  function updateChevron($element, isExpanded) {
    $element.attr('data-feather', isExpanded ? 'chevron-down' : 'chevron-right');
  }

  // Helper to get type suffix for CD content
  function getTypeSuffix(type) {
    return type === 'description' ? 'desc' : 'comm';
  }

  // Helper to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Helper to escape regex special characters
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Helper function to apply cd-expanded class to rows with visible CD-content
  function applyCdExpandedClass($table) {
    $table.find('tbody tr').each(function() {
      const $row = $(this);
      const hasVisibleContent = $row.find('.CD-content:visible').length > 0;
      if (hasVisibleContent) {
        $row.addClass('cd-expanded');
      } else {
        $row.removeClass('cd-expanded');
      }
    });
  }

  // Helper to escape regex special characters
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Helper to create regex pattern that matches umlaut variants
  // Handles: ü/ue/u, ä/ae/a, ö/oe/o in all directions
  function createUmlautPattern(searchTerm) {
    // First escape special regex characters
    const escaped = escapeRegex(searchTerm);
    // Replace in specific order: longer patterns first, then shorter
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

  // Highlight helper: wrap matches with <mark class="search-highlight">
  // Preserves HTML tags in the content (e.g., <i> for italics)
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
      const plainText = (tempDiv.textContent || tempDiv.innerText || '');
      
      // Create regex pattern that matches the search term with umlaut variants
      const pattern = createUmlautPattern(t);
      const regex = new RegExp(pattern, 'gi');
      
      // Check if the search term exists using the regex
      if (!regex.test(plainText)) {
        return str; // Term not found, return original
      }
      
      // Find ALL occurrences of the search term in plain text using regex
      regex.lastIndex = 0; // Reset regex after test()
      const matches = [];
      let match;
      while ((match = regex.exec(plainText)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length });
        // Move position forward by 1 to find overlapping matches
        regex.lastIndex = match.index + 1;
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

  // Function to format the child row details
  function formatDetails(row) {
    // Extract unique record ID from row.id (e.g., "https://e-laute.info/data/sources/1" -> "1")
    const recordId = row.id ? row.id.split('/').pop() : Math.random().toString(36).substr(2, 9);
    
    // Capitalize first letter of physicalType
    const typeValue = row.physicalType ?
      row.physicalType.charAt(0).toUpperCase() + row.physicalType.slice(1) : '';

    let rows = '';

    // Add alternative title row only if it exists
    if (row.alternativeTitle) {
      rows += generateSimpleRow('Alternative title:', row.alternativeTitle);
    }

    // Add type row (not searchable, skip highlighting)
    rows += generateSimpleRow('Type:', typeValue, true);
    
    // Add empty spacing row after first subgroup with smaller height
    rows += generateSpacerRow(null, true);

    // Check if Contextual Metadata subgroup has any content
    const hasContextualMetadata = row.provenance || row.function || row.fundamenta !== undefined || row.codicology;
    
    if (hasContextualMetadata) {
      // Add Contextual Metadata heading
      rows += generateSubgroupHeading('Contextual Metadata', 'contextual');

      // Collect all rows for this subgroup
      let contextualRows = '';
      contextualRows += generateSubtableRows(row.provenance, 'Provenance:', 'prov', recordId);
      contextualRows += generateSubtableRows(row.function, 'Function:', 'func', recordId);
      const fundamentaValue = row.fundamenta == 1 ? 'Yes' : 'No';
      contextualRows += generateSimpleRow('Fundamenta:', fundamentaValue, true); // Not searchable, skip highlighting
      contextualRows += generateSubtableRows(row.codicology, 'Codicology:', 'codic', recordId);

      // Wrap all rows at once so only the first gets the first-subgroup-row class
      rows += wrapInSubgroup(contextualRows, 'contextual', true);

      // Add empty spacing row after Contextual Metadata subgroup
      rows += generateSpacerRow('contextual');
    }

    // Check if Further Identifiers subgroup has any content
    const hasFurtherIdentifiers = row.brown || row.otherShelfmark;
    
    if (hasFurtherIdentifiers) {
      // Add Further Identifiers subgroup heading
      rows += generateSubgroupHeading('Further Identifiers', 'identifiers');

      // Collect all rows for this subgroup
      let identifiersRows = '';
      if (row.brown) {
        identifiersRows += generateSimpleRow('Brown:', row.brown);
      }
      if (row.otherShelfmark) {
        toArray(row.otherShelfmark).forEach((item, index) => {
          if (item && item.label) {
            let value = item.label;
            if (item.url) {
              value = `<a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.label}</a>`;
            }
            identifiersRows += generateSimpleRow(getFirstLabel(index, 'Other shelfmarks:'), value);
          }
        });
      }

      // Wrap all rows at once so only the first gets the first-subgroup-row class
      rows += wrapInSubgroup(identifiersRows, 'identifiers', true);

      // Add empty spacing row after Further Identifiers subgroup
      rows += generateSpacerRow('identifiers');
    }

    // Check if Bibliography and Related Resources subgroup has any content
    const hasBibliography = row.referencedBy || row.relatedResource;
    
    if (hasBibliography) {
      // Add Bibliography and Related Resources subgroup heading
      rows += generateSubgroupHeading('Bibliography and Related Resources', 'bibliography');

      // Collect all rows for this subgroup
      let bibliographyRows = '';
      if (row.referencedBy) {
        const referencedByItems = toArray(row.referencedBy);
        bibliographyRows += generateBibliographyRows(referencedByItems, 'Editions:', 'Edition');
        bibliographyRows += generateBibliographyRows(referencedByItems, 'Catalogues:', 'Catalogue');
        bibliographyRows += generateBibliographyRows(referencedByItems, 'Other bibliography:', null);
      }
      if (row.relatedResource) {
        toArray(row.relatedResource).forEach((item, index) => {
          if (item && item.label) {
            let value = item.label;
            if (item.url) {
              value = `<a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.label}</a>`;
            }
            bibliographyRows += generateSimpleRow(getFirstLabel(index, 'Related resources:'), value);
          }
        });
      }

      // Wrap all rows at once so only the first gets the first-subgroup-row class
      rows += wrapInSubgroup(bibliographyRows, 'bibliography', true);

      // Add empty spacing row after Bibliography subgroup (always visible)
      rows += generateSpacerRow();
    }

    // Get actual column widths from main table
    const widths = getColumnWidths();

    return '<div class="child-wrapper"><table class="details-table">' +
      '<colgroup>' +
      '<col style="width: ' + widths[0] + ';">' +  // Chevron column
      '<col style="width: ' + widths[1] + ';">' +  // Shelfmark column
      '<col style="width: ' + widths[2] + ';">' +  // Title column
      '<col>' +  // Remaining columns span naturally with colspan
      '<col>' +
      '<col>' +
      '<col>' +
      '<col>' +
      '<col>' +
      '<col>' +
      '</colgroup>' +
      rows +
      '</table></div>';
  }

  // Reusable render function with highlighting and optional bracket removal
  function renderWithHighlight(data, type, removeBracket = false) {
    if (type === 'sort') {
      return (removeBracket && data) ? data.replace(/^\[/, '') : (data || '');
    }
    return (type === 'display') ? highlightText(data, currentSearchTerm) : (data || '');
  }

  // Reusable render function for combining primary and 'other' values
  function combineValues(row, primaryField, otherField) {
    const values = [];
    if (row[primaryField] && row[primaryField].label) {
      values.push(row[primaryField].label);
    }
    if (row[otherField]) {
      if (Array.isArray(row[otherField])) {
        row[otherField].forEach(item => {
          if (item && item.label) {
            values.push(item.label);
          }
        });
      } else if (row[otherField].label) {
        values.push(row[otherField].label);
      }
    }
    return values.join('<br/>');
  }

  // Helper to render combined field values with highlighting
  function renderCombinedField(row, primaryField, otherField, type) {
    if (type === 'display') {
      const values = [];
      if (row[primaryField] && row[primaryField].label) {
        const highlighted = highlightText(row[primaryField].label, currentSearchTerm);
        if (row[primaryField].url) {
          values.push(`<a href="${row[primaryField].url}" target="_blank" rel="noopener noreferrer">${highlighted}</a>`);
        } else {
          values.push(highlighted);
        }
      }
      if (row[otherField]) {
        const otherItems = Array.isArray(row[otherField]) ? row[otherField] : [row[otherField]];
        otherItems.forEach(item => {
          if (item && item.label) {
            const highlighted = highlightText(item.label, currentSearchTerm);
            if (item.url) {
              values.push(`<a href="${item.url}" target="_blank" rel="noopener noreferrer">${highlighted}</a>`);
            } else {
              values.push(highlighted);
            }
          }
        });
      }
      return values.join('<br/>');
    }
    return '';
  }

  // Helper to get first-item label
  function getFirstLabel(index, labelText) {
    return index === 0 ? labelText : '';
  }

  // Helper to strip HTML tags from text for searching
  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  // Helper to extract and stringify any value (including nested objects)
  function extractText(val) {
    if (!val) return '';
    if (typeof val === 'string') return stripHtml(val);
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val)) {
      return val.map(v => extractText(v)).join(' ');
    }
    if (typeof val === 'object') {
      // Extract all relevant properties from objects (including nested bibliography fields)
      const parts = [];
      if (val.label) parts.push(stripHtml(val.label));
      if (val.description) parts.push(stripHtml(val.description));
      if (val.comment) parts.push(stripHtml(val.comment));
      if (val.bookShort) parts.push(stripHtml(val.bookShort));
      if (val.referenceSource && val.referenceSource.bookShort) parts.push(stripHtml(val.referenceSource.bookShort));
      if (val.referencePages) parts.push(stripHtml(val.referencePages));
      return parts.join(' ');
    }
    return '';
  }

  // Helper to normalize German umlauts for search matching
  // Converts ü/ue→u, ä/ae→a, ö/oe→o so that all variants match
  function normalizeUmlauts(text) {
    if (!text) return '';
    return text
      .replace(/ü/gi, 'u')
      .replace(/ä/gi, 'a')
      .replace(/ö/gi, 'o')
      .replace(/ue/gi, 'u')
      .replace(/ae/gi, 'a')
      .replace(/oe/gi, 'o');
  }

  // Helper to build searchable text from row data fields
  function buildSearchableText(rowData, detailOnly = false) {
    const fields = detailOnly ? [
      'alternativeTitle', 'brown', 'provenance', 'function', 
      'codicology', 'otherShelfmark', 'referencedBy', 'relatedResource'
    ] : [
      'shelfmark', 'title', 'shortTitle', 'date', 'author', 'publisher',
      'printPlace', 'rism', 'vd16', 'alternativeTitle',
      'provenance', 'function', 'codicology', 'brown', 'otherShelfmark',
      'referencedBy', 'relatedResource'
    ];
    const text = fields.map(field => extractText(rowData[field])).join(' ').toLowerCase();
    return normalizeUmlauts(text);
  }

  // Global search variable
  let table;
  let currentSearchTerm = '';
  let isExpandAllActive = false; // Track if "Expand All" is active
  let isDescCommentsOpen = false; // Track if descriptions/comments are open

  // Fetch data from Q1.json
  // Read URL parameters
  const urlParams = readUrlParams();

  // Initialize current search term from URL
  currentSearchTerm = urlParams.search;
  
  // Initialize lastSearchValue to match URL search (to properly detect changes when clearing)
  let lastSearchValue = urlParams.search;

  // Initialize filter variables from URL parameters (BEFORE DataTable initialization)
  const minYear = 1450;
  const maxYear = 1620;
  let minDate = urlParams.minDate;
  let maxDate = urlParams.maxDate;
  let physicalTypeFilter = urlParams.physicalType;
  let fundamentaFilter = urlParams.fundamenta;
  let selectedShortTitles = new Set(urlParams.shortTitles);
  let selectedPersons = new Set(urlParams.persons);
  let selectedPlaces = new Set(urlParams.places);
  let selectedFunctions = new Set(urlParams.functions);
  let selectedShelfmarks = new Set(urlParams.shelfmarks);

  // Logic mode for each filter (false = AND, true = OR) - initialized from URL params
  const shortTitlesLogic = true; // No UI toggle, always OR
  let personsLogic = urlParams.personsLogic;
  let placesLogic = urlParams.placesLogic;
  let functionsLogic = urlParams.functionsLogic;
  const shelfmarksLogic = true; // No UI toggle, always OR

  // Constants
  const NO_RECORDS_MESSAGE = '<div style="color: #666;">No matching records available</div>';

  // Generic helper to extract values from a record based on field configuration
  function getValuesFromRecord(row, fields) {
    const values = [];
    fields.forEach(field => {
      // Navigate nested paths (e.g., "author.normalizedName")
      const pathParts = field.path.split('.');
      let data = row;
      for (const part of pathParts) {
        if (!data) break;
        data = data[part];
      }

      if (data) {
        const items = Array.isArray(data) ? data : [data];
        items.forEach(item => {
          const value = field.property ? item[field.property] : item;
          if (value) values.push(value);
        });
      }
    });
    return values.length > 0 ? values : ['—'];
  }

  // Field configurations for each filter type
  const FILTER_CONFIGS = {
    shortTitles: [{ path: 'shortTitle' }],
    persons: [
      { path: 'author', property: 'normalizedName' },
      { path: 'publisher', property: 'normalizedName' }
    ],
    places: [
      { path: 'printPlace', property: 'normalizedName' },
      { path: 'provenance', property: 'normalizedName' }
    ],
    functions: [{ path: 'function', property: 'label' }],
    shelfmarks: [
      { path: 'shelfmark', property: 'label' },
      { path: 'otherShelfmark', property: 'label' }
    ]
  };

  // Wrapper functions for backward compatibility
  function getShortTitlesFromRecord(row) {
    return getValuesFromRecord(row, FILTER_CONFIGS.shortTitles);
  }

  function getPersonsFromRecord(row) {
    return getValuesFromRecord(row, FILTER_CONFIGS.persons);
  }

  function getPlacesFromRecord(row) {
    return getValuesFromRecord(row, FILTER_CONFIGS.places);
  }

  function getFunctionsFromRecord(row) {
    return getValuesFromRecord(row, FILTER_CONFIGS.functions);
  }

  function getShelfmarksFromRecord(row) {
    return getValuesFromRecord(row, FILTER_CONFIGS.shelfmarks);
  }

  // Helper function to check multi-select filter
  function checkMultiSelectFilter(recordValues, selectedSet, useOrLogic) {
    if (selectedSet.size === 0) return true;

    if (useOrLogic) {
      // OR logic: record must contain AT LEAST ONE of the selected values
      return recordValues.some(value => selectedSet.has(value));
    } else {
      // AND logic: record must contain ALL selected values
      return Array.from(selectedSet).every(value => recordValues.includes(value));
    }
  }

  // Shared filter function (excludeShortTitles/excludePersons/excludePlaces/excludeFunctions/excludeShelfmarks: whether to skip those filters)
  function applyFilters(row, excludeShortTitles = false, excludePersons = false, excludePlaces = false, excludeFunctions = false, excludeShelfmarks = false) {
    const searchTerm = normalizeUmlauts(currentSearchTerm.toLowerCase().trim());
    if (searchTerm && !buildSearchableText(row).includes(searchTerm)) {
      return false;
    }

    if (row.date && row.date.timespan && row.date.timespan.earliestDate && row.date.timespan.earliestDate.value) {
      const recordDate = parseInt(row.date.timespan.earliestDate.value);
      if (recordDate < minDate || recordDate > maxDate) {
        return false;
      }
    }

    if (physicalTypeFilter !== 'both') {
      const recordType = (row.physicalType || '').toLowerCase();
      if (recordType !== physicalTypeFilter) {
        return false;
      }
    }

    if (fundamentaFilter !== 'both') {
      const recordFundamenta = row.fundamenta;
      if (fundamentaFilter === 'yes' && recordFundamenta !== 1) {
        return false;
      }
      if (fundamentaFilter === 'no' && recordFundamenta !== 0) {
        return false;
      }
    }

    // Check multi-select filters using helper function
    if (!excludeShortTitles && !checkMultiSelectFilter(getShortTitlesFromRecord(row), selectedShortTitles, shortTitlesLogic)) {
      return false;
    }

    if (!excludePersons && !checkMultiSelectFilter(getPersonsFromRecord(row), selectedPersons, personsLogic)) {
      return false;
    }

    if (!excludePlaces && !checkMultiSelectFilter(getPlacesFromRecord(row), selectedPlaces, placesLogic)) {
      return false;
    }

    if (!excludeFunctions && !checkMultiSelectFilter(getFunctionsFromRecord(row), selectedFunctions, functionsLogic)) {
      return false;
    }

    if (!excludeShelfmarks && !checkMultiSelectFilter(getShelfmarksFromRecord(row), selectedShelfmarks, shelfmarksLogic)) {
      return false;
    }

    return true;
  }

  // Add custom search function for searching all fields including hidden ones
  $.fn.dataTable.ext.search.push(function(settings, searchData, dataIndex, rowData) {
    if (settings.nTable.id !== 'sourcesTable') return true;
    return applyFilters(rowData);
  });

  fetch('/assets/Q1.json')
    .then(response => response.json())
    .then(json => {
      // Extract the graph array
      const data = json['@graph'] || [];

      // Initialize DataTable
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
                const highlighted = highlightText(data, currentSearchTerm);
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
              if (type === 'display') {
                return highlightText(data, currentSearchTerm);
              }
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
        searching: true,  // Enable searching for custom filter to work
        info: false,
        ordering: true,
        order: [[1, 'asc']],  // Sort by Shelfmark by default (now column 1)
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]],
        dom: 'lrtp',  // Layout without filter (f) and info (i)
        stripeClasses: [],  // Disable alternating row colors
        drawCallback: function() {
          const api = this.api();
          const info = api.page.info();
          const totalRecords = info.recordsDisplay;

          // Wrap length selector in container if not already wrapped
          const $lengthDiv = $('.dataTables_length');
          if ($lengthDiv.length && !$lengthDiv.parent().hasClass('length-wrapper')) {
            $lengthDiv.wrap('<div class="length-wrapper"></div>');
          }

          // Add or update record count inside the wrapper, after length selector
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
          // Update all filter lists
          const updateFunctions = [updateShortTitlesList, updatePersonsList, updatePlacesList, updateFunctionsList, updateShelfmarksList];
          updateFunctions.forEach(fn => setTimeout(fn, 0));

          // Expand matching rows if there's a search term from URL
          const term = normalizeUmlauts(currentSearchTerm.toLowerCase().trim());
          if (term) {
            setTimeout(function() {
              expandDetailRowsWithMatches(term);
              expandSubgroupsWithMatches(term);
              updateExpandCollapseButton();
              feather.replace();
            }, 100);
          }
        }
      });

      // Helper to update all filter lists
      function updateAllFilterLists() {
        updateShortTitlesList();
        updatePersonsList();
        updatePlacesList();
        updateFunctionsList();
        updateShelfmarksList();
      }

      // Helper function to expand all rows on current page
      function expandAllCurrentPageRows() {
        // Get rows on current page using DataTables API, then work with actual DOM nodes
        const currentPageRows = table.rows({ page: 'current' });
        
        // Process each row's actual DOM node
        currentPageRows.nodes().each(function(node) {
          const tr = $(node);
          const row = table.row(node);
          
          if (!row || row.length === 0) {
            return; // continue to next
          }
          
          // Force destroy existing child first
          if (row.child.isShown()) {
            row.child.hide();
          }
          row.child.remove();
          tr.removeClass('shown');
          
          // Create child content and manually insert it into the DOM
          const childContent = formatDetails(row.data());
          const $childTr = $('<tr class="child"><td colspan="' + tr.children('td').length + '">' + childContent + '</td></tr>');
          
          // Insert child row directly after the parent row in DOM
          tr.after($childTr);
          tr.addClass('shown');
          updateChevron(tr.find('td.dt-control .chev'), true);
          
          // Also tell DataTables about the child (for internal tracking)
          row.child(childContent);
          
          // Expand all subgroups within this child row
          $childTr.find('.subgroup-content').show();
        });

        // Apply cd-expanded class to all visible child tables
        scheduleApplyCdClass();

        feather.replace();

        // If descriptions/comments were open, open them on this page too
        if (isDescCommentsOpen) {
          setTimeout(function() {
            openAllDescCommentsOnPage();
            updateToggleDescCommentsBtn();
          }, 50);
        } else {
          updateToggleDescCommentsBtn();
        }

        // Update button state to reflect that everything is now expanded
        isExpandAllActive = true;
        $('#expandCollapseBtn').text('Collapse All');
      }

      // Replace Feather icons after table is drawn and update persons, functions and shelfmarks lists
      table.on('draw', function() {
        feather.replace();
        updateAllFilterLists();

        // Save the expand all state BEFORE updateExpandCollapseButton changes it
        const wasExpandAllActive = isExpandAllActive;

        updateExpandCollapseButton();

        // If "Expand All" was active before this draw, expand all rows on the current page
        if (wasExpandAllActive && !isManualToggle && !currentSearchTerm.trim()) {
          // Use longer delay and requestAnimationFrame to ensure DOM is ready
          setTimeout(function() {
            requestAnimationFrame(function() {
              expandAllCurrentPageRows();
            });
          }, 100);
        }

        setTimeout(updateToggleDescCommentsBtn, 100);
      });

      // Handle search input
      // Helper function to toggle all subgroups (show or hide)
      function toggleAllSubgroups(show) {
        $('.subgroup-heading-row').each(function() {
          const $row = $(this);
          const subgroup = $row.data('subgroup');
          const $subgroupContent = $(`.subgroup-content[data-subgroup="${subgroup}"]`);
          $subgroupContent.toggle(show);
          updateChevron($row.find('.chev'), show);
        });
      }

      // Convenience wrappers
      function collapseAllSubgroups() {
        toggleAllSubgroups(false);
      }

      function expandAllSubgroups() {
        toggleAllSubgroups(true);
      }

      // Helper function to expand detail rows that have matches
      function expandDetailRowsWithMatches(term) {
        table.rows({ search: 'applied' }).every(function() {
          const rowData = this.data();
          const tr = $(this.node());
          const row = this;

          // Build searchable text from ONLY detail fields (excluding main table columns)
          const detailText = buildSearchableText(rowData, true);

          // Only expand if detail content (not main columns) has a match
          if (detailText.includes(term)) {
            toggleChildRow(row, tr, true);

            // Apply cd-expanded class to rows with visible CD-content
            scheduleApplyCdClass(tr);
          }
        });
      }

      // Helper function to expand subgroups that have matches
      function expandSubgroupsWithMatches(term) {
        $('.subgroup-heading-row').each(function() {
          const $row = $(this);
          const subgroup = $row.data('subgroup');
          // Scope selector to the same details-table (same record), not globally
          const $detailsTable = $row.closest('.details-table');
          const $subgroupContent = $detailsTable.find(`.subgroup-content[data-subgroup="${subgroup}"]`);

          // Check if any row in this subgroup contains the search term (including in CD-content)
          let hasMatch = false;
          $subgroupContent.each(function() {
            const $contentRow = $(this);
            // Check visible text and also CD-content divs
            const visibleText = normalizeUmlauts($contentRow.clone().find('.CD-content').remove().end().text().toLowerCase());
            const cdText = normalizeUmlauts($contentRow.find('.CD-content').text().toLowerCase());
            if (visibleText.includes(term) || cdText.includes(term)) {
              hasMatch = true;
              return false; // break
            }
          });

          // Expand or collapse subgroup based on matches
          $subgroupContent.toggle(hasMatch);
          updateChevron($row.find('.chev'), hasMatch);
        });
      }

      // Helper function to clear child row cache
      function clearChildRowCache() {
        table.rows().every(function() {
          if (this.child.isShown()) {
            this.child.hide();
          }
          this.child.remove();
        });
      }

      // Helper function to toggle a single child row
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

      // Helper function to apply cd-expanded class to a child table
      function applyChildTableCdClass(tr) {
        const $childTable = tr.next('.child').find('.details-table');
        if ($childTable.length) {
          applyCdExpandedClass($childTable);
        }
      }

      // Helper function to apply cd-expanded class to all visible child tables
      function applyAllChildTablesCdClass() {
        $('.child .details-table').each(function() {
          applyCdExpandedClass($(this));
        });
      }

      // Helper function to schedule applying cd-expanded class (with 0ms delay)
      function scheduleApplyCdClass(tr = null) {
        setTimeout(() => {
          if (tr) {
            applyChildTableCdClass(tr);
          } else {
            applyAllChildTablesCdClass();
          }
        }, 0);
      }

      // Helper function to update expand/collapse button text based on current state
      function updateExpandCollapseButton() {
        const $btn = $('#expandCollapseBtn');

        // Only count rows on the current page that match current filters
        const visibleRows = table.rows({ search: 'applied', page: 'current' });
        const totalRows = visibleRows.count();
        let expandedRows = 0;
        let hasCollapsedSubgroup = false;

        visibleRows.every(function() {
          if (this.child.isShown()) {
            expandedRows++;
            
            // Get the child row element using DataTables API
            // this.child() returns the child row(s) jQuery object
            const $childRow = $(this.child());
            const $subgroups = $childRow.find('.subgroup-content');
            
            // Find all subgroup-content elements and check if any are hidden
            $subgroups.each(function() {
              // Check both inline style and computed style
              if (this.style.display === 'none' || window.getComputedStyle(this).display === 'none') {
                hasCollapsedSubgroup = true;
                return false; // break out of .each()
              }
            });
          }
        });

        // Show "Collapse All" only if:
        // 1. All rows are expanded, AND
        // 2. No subgroups are collapsed
        const allExpanded = totalRows > 0 && expandedRows === totalRows && !hasCollapsedSubgroup;
        
        if (allExpanded) {
          $btn.text('Collapse All');
          isExpandAllActive = true;
        } else {
          $btn.text('Expand All');
          isExpandAllActive = false;
        }
      }

      // Create global search handler function
      let globalSearchHandler = function() {
        if (isManualToggle) {
          return;
        }
        // Skip if search value hasn't actually changed
        if (this.value === lastSearchValue) {
          return;
        }
        lastSearchValue = this.value;
        currentSearchTerm = this.value;
        manuallyHiddenContent.clear(); // Clear manual toggle tracking on new search
        
        // Reset expand all state when search changes - search should only expand matching detail rows
        isExpandAllActive = false;
        
        table.rows().invalidate();

        const term = normalizeUmlauts(currentSearchTerm.toLowerCase().trim());

        if (!term) {
          collapseAllDetails();
        }

        table.draw();

        if (!term) {
          table.one('draw', function() {
            collapseAllDetails();
            collapseAllSubgroups();
            updateExpandCollapseButton();
            feather.replace();
          });
          return;
        }

        // Use setTimeout to ensure draw completes before processing
        setTimeout(function() {
          collapseAllDetails();
          expandDetailRowsWithMatches(term);
          expandSubgroupsWithMatches(term);
          updateExpandCollapseButton();
          feather.replace();
        }, 50);
      };

      $('#globalSearch').on('input keyup change', globalSearchHandler);

      // Add event listener for opening and closing details
      $('#sourcesTable tbody').on('click', 'td.dt-control', function() {
        const tr = $(this).closest('tr');
        const row = table.row(tr);
        const isShown = row.child.isShown();

        toggleChildRow(row, tr, !isShown);

        if (!isShown) {
          // Apply cd-expanded class to rows with visible CD-content
          scheduleApplyCdClass(tr);
        }

        updateExpandCollapseButton();
        setTimeout(updateToggleDescCommentsBtn, 50);
        feather.replace();
      });

      // Add event listener for contextual metadata badges
      $('#sourcesTable tbody').on('click', '.cd-badge', function(e) {
        // Set flag FIRST, before any other events can fire
        isManualToggle = true;

        e.preventDefault();
        e.stopPropagation();

        const targetId = $(this).data('target');
        const $targetRow = $('#' + targetId);
        const $row = $(this).closest('tr');
        const $badge = $(this);

        if ($targetRow.is(':visible')) {
          $targetRow.hide();
          $badge.removeClass('active');
          // Track that user manually hid this content
          if (targetId) {
            manuallyHiddenContent.add(targetId);
          }
          // Change icon back to plus-circle
          const $icon = $badge.find('svg');
          $icon.replaceWith(feather.icons['plus-circle'].toSvg({ width: 12, height: 12, style: 'vertical-align: -2px; margin-right: 4px;' }));

          // Check if any CD-content in this row is still visible
          const hasVisibleContent = $row.find('.CD-content:visible').length > 0;
          if (!hasVisibleContent) {
            $row.removeClass('cd-expanded');
          }
        } else {
          $targetRow.show();
          $badge.addClass('active');
          // Remove from manually hidden set when user opens it
          manuallyHiddenContent.delete(targetId);
          // Change icon to minus-circle
          const $icon = $badge.find('svg');
          $icon.replaceWith(feather.icons['minus-circle'].toSvg({ width: 12, height: 12, style: 'vertical-align: -2px; margin-right: 4px;' }));
          $row.addClass('cd-expanded');
        }

        updateToggleDescCommentsBtn();

        // Clear flag after a delay to allow for any pending events
        setTimeout(() => {
          isManualToggle = false;
        }, 400);
      });

      // Add event listener for subgroup heading collapse/expand
      $('#sourcesTable tbody').on('click', '.heading-toggle', function(e) {
        e.stopPropagation();
        const $row = $(this).closest('.subgroup-heading-row');
        const subgroup = $row.data('subgroup');
        const $contentRows = $row.closest('table').find('.subgroup-content[data-subgroup="' + subgroup + '"]');
        
        $contentRows.toggle({
          duration: 300,
          easing: 'swing'
        });
      });
      
      // Add expand/collapse all button after DataTable is initialized
      $('.dataTables_length').after('<button id="expandCollapseBtn">Expand All</button><button id="toggleDescCommentsBtn">Open Descriptions/Comments</button>');

      // Function to check if there are visible but not expanded description/comment badges
      function hasCollapsedDescriptionBadges() {
        let found = false;
        $('#sourcesTable .cd-badge:visible:not(.active)').each(function() {
          found = true;
          return false; // break
        });
        return found;
      }

      // Function to check if there are any expanded description/comment badges
      function hasExpandedDescriptionBadges() {
        return $('#sourcesTable .cd-badge:visible.active').length > 0;
      }

      // Function to update the toggle descriptions/comments button visibility and text
      function updateToggleDescCommentsBtn() {
        const $btn = $('#toggleDescCommentsBtn');
        const hasCollapsed = hasCollapsedDescriptionBadges();
        const hasExpanded = hasExpandedDescriptionBadges();

        if (hasCollapsed || hasExpanded) {
          $btn.addClass('visible');
          $btn.text(hasCollapsed ? 'Open Descriptions/Comments' : 'Close Descriptions/Comments');
        } else {
          $btn.removeClass('visible');
        }
      }

      // Handle toggle descriptions/comments button
      $('#toggleDescCommentsBtn').on('click', function() {
        const $btn = $(this);
        const isOpening = $btn.text() === 'Open Descriptions/Comments';

        $('#sourcesTable .cd-badge:visible').each(function() {
          const $badge = $(this);
          const targetId = $badge.data('target');
          const $targetRow = $('#' + targetId);
          const isActive = $badge.hasClass('active');

          if (isOpening && !isActive) {
            // Open this description/comment
            $targetRow.show();
            $badge.addClass('active');
            manuallyHiddenContent.delete(targetId);
            const $icon = $badge.find('svg');
            $icon.replaceWith(feather.icons['minus-circle'].toSvg({ width: 12, height: 12, style: 'vertical-align: -2px; margin-right: 4px;' }));
            $badge.closest('tr').addClass('cd-expanded');
          } else if (!isOpening && isActive) {
            // Close this description/comment
            $targetRow.hide();
            $badge.removeClass('active');
            manuallyHiddenContent.add(targetId);
            const $icon = $badge.find('svg');
            $icon.replaceWith(feather.icons['plus-circle'].toSvg({ width: 12, height: 12, style: 'vertical-align: -2px; margin-right: 4px;' }));
            // Check if any CD-content in this row is still visible
            const $row = $badge.closest('tr');
            const hasVisibleContent = $row.find('.CD-content:visible').length > 0;
            if (!hasVisibleContent) {
              $row.removeClass('cd-expanded');
            }
          }
        });

        $btn.text(isOpening ? 'Close Descriptions/Comments' : 'Open Descriptions/Comments');
        isDescCommentsOpen = isOpening;
      });

      // Helper function to open all descriptions/comments on current page
      function openAllDescCommentsOnPage() {
        $('#sourcesTable .cd-badge:visible:not(.active)').each(function() {
          const $badge = $(this);
          const targetId = $badge.data('target');
          const $targetRow = $('#' + targetId);

          $targetRow.show();
          $badge.addClass('active');
          manuallyHiddenContent.delete(targetId);
          const $icon = $badge.find('svg');
          $icon.replaceWith(feather.icons['minus-circle'].toSvg({ width: 12, height: 12, style: 'vertical-align: -2px; margin-right: 4px;' }));
          $badge.closest('tr').addClass('cd-expanded');
        });
      }
      
      // Helper function to collapse all detail rows
      function collapseAllDetails() {
        table.rows().every(function() {
          const row = this;
          if (row.child.isShown()) {
            const tr = $(this.node());
            row.child.hide();
            tr.removeClass('shown');
            updateChevron(tr.find('td.dt-control .chev'), false);
          }
        });
      }
      
      // Helper function to toggle all rows and subgroups
      function toggleAllRowsAndSubgroups(expand) {
        table.rows().every(function() {
          const row = this;
          const tr = $(this.node());
          const isShown = row.child.isShown();

          if (expand !== isShown) {
            toggleChildRow(row, tr, expand);
          }
        });

        // Apply cd-expanded class to all visible child tables
        if (expand) {
          scheduleApplyCdClass();
        }

        toggleAllSubgroups(expand);
      }
      
      // Handle expand/collapse all button
      $('#expandCollapseBtn').on('click', function() {
        const $btn = $(this);
        const isExpanding = $btn.text() === 'Expand All';

        toggleAllRowsAndSubgroups(isExpanding);
        $btn.text(isExpanding ? 'Collapse All' : 'Expand All');
        isExpandAllActive = isExpanding; // Track expand all state
        feather.replace();
        setTimeout(updateToggleDescCommentsBtn, 100);
      });

      // ===== FILTER MODAL AND DATE SLIDER =====
      
      const $filterContainer = $('#filterContainer');
      
      // Create date range slider with external label
      const $dateWrapper = $('<div>').attr('id', 'dateWrapper');
      const $dateLabel = $('<div>').addClass('filter-label').text('Date');
      const $dateSliderContainer = $('<div>').attr('id', 'dateSliderContainer');
      
      const $dateSliderValues = $('<div>')
        .attr('id', 'dateSliderValues')
        .html('<input type="text" id="minDateInput" value="1450"><span id="minDateValue">1450</span><span id="maxDateValue">1620</span><input type="text" id="maxDateInput" value="1620">');
      
      const $dateSliderTrack = $('<div>').attr('id', 'dateSliderTrack');
      
      const $dateSliderRange = $('<div>').attr('id', 'dateSliderRange');
      
      const $dateSliderHandleMin = $('<div>')
        .attr('id', 'dateSliderHandleMin')
        .addClass('date-slider-handle');
      
      const $dateSliderHandleMax = $('<div>')
        .attr('id', 'dateSliderHandleMax')
        .addClass('date-slider-handle');
      
      $dateSliderTrack.append($dateSliderRange, $dateSliderHandleMin, $dateSliderHandleMax);
      $dateSliderContainer.append($dateSliderValues, $dateSliderTrack);
      $dateWrapper.append($dateLabel, $dateSliderContainer);
      
      // Add date slider to filter container
      $filterContainer.append($dateWrapper);

      // Helper function to increment value counts in a map
      function incrementValueCounts(valuesInRecord, valuesMap) {
        const uniqueValues = new Set(valuesInRecord);
        uniqueValues.forEach(value => {
          valuesMap.set(value, (valuesMap.get(value) || 0) + 1);
        });
      }

      // Generic function to update filter list
      function updateFilterList(config) {
        if (!table) return;

        const searchTerm = $(config.searchInputId).val().toLowerCase().trim();
        const valuesMap = new Map();
        const selectedSet = config.selectedSet;
        const otherSelected = Array.from(selectedSet);

        // Calculate counts
        table.rows().data().each(function(row) {
          if (!applyFilters(row, ...config.excludeParams)) return;

          const valuesInRecord = config.getValuesFunc(row);

          if (config.hasLogic) {
            const useOrLogic = config.logicVar();
            if (useOrLogic) {
              // OR logic: count ALL values from records that pass other filters
              incrementValueCounts(valuesInRecord, valuesMap);
            } else {
              // AND logic: count values from records that contain ALL selected values
              const hasAllOtherSelected = otherSelected.every(v => valuesInRecord.includes(v));
              if (hasAllOtherSelected || selectedSet.size === 0) {
                incrementValueCounts(valuesInRecord, valuesMap);
              }
            }
          } else {
            // No logic mode (e.g., shortTitles) - simple counting
            incrementValueCounts(valuesInRecord, valuesMap);
          }
        });

        // Sort results
        const sortedValues = Array.from(valuesMap.entries())
          .filter(([name, count]) => !config.hasLogic || config.logicVar() || count > 0)
          .sort((a, b) => {
            if (a[0] === '—') return -1;
            if (b[0] === '—') return 1;
            return a[0].localeCompare(b[0]);
          });

        const $list = $(config.listId);
        $list.empty();

        if (sortedValues.length === 0) {
          $(config.searchInputId).hide();
          $list.append(NO_RECORDS_MESSAGE);
          return;
        }

        $(config.searchInputId).show();

        sortedValues.forEach(([name, count]) => {
          const id = config.idPrefix + name.replace(/[^a-zA-Z0-9]/g, '-');
          const isChecked = selectedSet.has(name);
          const matches = !searchTerm || name.toLowerCase().includes(searchTerm);

          const countHtml = config.showCount ? `<span class="checkbox-item-count">${count}</span>` : '';
          const $item = $(`
            <div class="checkbox-item ${config.itemClass || ''}" style="display: ${matches ? 'flex' : 'none'}">
              <input type="checkbox" id="${id}" data-${config.dataAttr}="${name}" ${isChecked ? 'checked' : ''}>
              <label for="${id}">${name}</label>
              ${countHtml}
            </div>
          `);
          $list.append($item);
        });

        // Re-attach event handlers
        $(`${config.listId} input[type="checkbox"]`).off('change').on('change', function() {
          const value = $(this).data(config.dataAttr);
          if (this.checked) {
            selectedSet.add(value);
          } else {
            selectedSet.delete(value);
          }
          applyFilterChange();
        });
      }

      // Configuration for filter list updates
      const FILTER_LIST_CONFIGS = {
        shortTitles: {
          searchInputId: '#shortTitlesSearch',
          listId: '#shortTitlesCheckboxList',
          selectedSet: selectedShortTitles,
          getValuesFunc: getShortTitlesFromRecord,
          excludeParams: [true, false, false, false, false],
          hasLogic: false,
          showCount: false,
          idPrefix: 'shorttitle-',
          dataAttr: 'shorttitle',
          itemClass: 'shorttitle-item'
        },
        persons: {
          searchInputId: '#personsSearch',
          listId: '#personsCheckboxList',
          selectedSet: selectedPersons,
          getValuesFunc: getPersonsFromRecord,
          excludeParams: [false, true, false, false, false],
          hasLogic: true,
          logicVar: () => personsLogic,
          showCount: true,
          idPrefix: 'person-',
          dataAttr: 'person'
        },
        places: {
          searchInputId: '#placesSearch',
          listId: '#placesCheckboxList',
          selectedSet: selectedPlaces,
          getValuesFunc: getPlacesFromRecord,
          excludeParams: [false, false, true, false, false],
          hasLogic: true,
          logicVar: () => placesLogic,
          showCount: true,
          idPrefix: 'place-',
          dataAttr: 'place'
        },
        functions: {
          searchInputId: '#functionsSearch',
          listId: '#functionsCheckboxList',
          selectedSet: selectedFunctions,
          getValuesFunc: getFunctionsFromRecord,
          excludeParams: [false, false, false, true, false],
          hasLogic: true,
          logicVar: () => functionsLogic,
          showCount: true,
          idPrefix: 'function-',
          dataAttr: 'function'
        }
      };

      // Create update functions dynamically from configs
      function updateShortTitlesList() {
        updateFilterList(FILTER_LIST_CONFIGS.shortTitles);
      }

      function updatePersonsList() {
        updateFilterList(FILTER_LIST_CONFIGS.persons);
      }

      function updatePlacesList() {
        updateFilterList(FILTER_LIST_CONFIGS.places);
      }

      function updateFunctionsList() {
        updateFilterList(FILTER_LIST_CONFIGS.functions);
      }

      // Accordion toggle
      $('.filter-accordion-header').on('click', function() {
        const $accordion = $(this).closest('.filter-accordion');
        const $content = $accordion.find('.filter-accordion-content');

        if ($accordion.hasClass('expanded')) {
          // Collapsing: set exact height first, then animate to 0
          const currentHeight = $content[0].scrollHeight;
          $content.css('max-height', currentHeight + 'px');
          setTimeout(() => {
            $accordion.removeClass('expanded');
            $content.css('max-height', '0');
          }, 10);
        } else {
          // Expanding: set to exact content height
          $accordion.addClass('expanded');
          const targetHeight = $content[0].scrollHeight;
          $content.css('max-height', targetHeight + 'px');
        }
      });

      // Helper function to process a single shelfmark and add to country groups
      function processShelfmark(shelf, countryGroups) {
        if (!shelf || !shelf.label) return;

        const countryCode = shelf.holdingInstitution?.countryCode || null;
        const country = shelf.holdingInstitution?.country || null;
        const countryKey = countryCode ? `${countryCode}|||${country}` : 'Other';

        if (!countryGroups.has(countryKey)) {
          countryGroups.set(countryKey, {
            countryCode: countryCode,
            country: country,
            shelfmarks: new Map()
          });
        }

        const group = countryGroups.get(countryKey);
        group.shelfmarks.set(shelf.label, (group.shelfmarks.get(shelf.label) || 0) + 1);
      }

      // Function to update shelfmarks list based on currently filtered results
      function updateShelfmarksList() {
        if (!table) return;

        const shelfmarksSearchTerm = $('#shelfmarksSearch').val().toLowerCase().trim();
        const countryGroups = new Map(); // Map of countryKey -> {countryCode, country, shelfmarks: Map}
        const availableShelfmarks = new Set(); // Track all available shelfmarks

        // Collect shelfmarks only from records that pass the other filters
        table.rows().data().each(function(row) {
          // Apply all filters EXCEPT shelfmarks filter
          if (!applyFilters(row, false, false, false, false, true)) return;

          // Process main shelfmark
          if (row.shelfmark && row.shelfmark.label) {
            availableShelfmarks.add(row.shelfmark.label);
          }
          processShelfmark(row.shelfmark, countryGroups);

          // Process other shelfmarks
          if (row.otherShelfmark) {
            const otherArray = Array.isArray(row.otherShelfmark) ? row.otherShelfmark : [row.otherShelfmark];
            otherArray.forEach(shelf => {
              if (shelf && shelf.label) {
                availableShelfmarks.add(shelf.label);
              }
              processShelfmark(shelf, countryGroups);
            });
          }
        });

        // Remove any selected shelfmarks that are no longer available
        selectedShelfmarks.forEach(shelfmark => {
          if (!availableShelfmarks.has(shelfmark)) {
            selectedShelfmarks.delete(shelfmark);
          }
        });

        const $shelfmarksList = $('#shelfmarksCheckboxList');
        $shelfmarksList.empty();

        if (countryGroups.size === 0) {
          $('#shelfmarksSearch').hide();
          $shelfmarksList.append(NO_RECORDS_MESSAGE);
          return;
        }

        $('#shelfmarksSearch').show();

        // Sort country groups: alphabetically by country code, "Other" last
        const sortedCountryKeys = Array.from(countryGroups.keys()).sort((a, b) => {
          if (a === 'Other') return 1;
          if (b === 'Other') return -1;
          return a.localeCompare(b);
        });

        sortedCountryKeys.forEach(countryKey => {
          const group = countryGroups.get(countryKey);

          // Create heading
          const headingText = countryKey === 'Other' ? 'Other' : `${group.countryCode} - ${group.country}`;
          const $heading = $('<div class="shelfmark-group-heading"></div>').text(headingText);
          $shelfmarksList.append($heading);

          // Sort shelfmarks within group
          const sortedShelfmarks = Array.from(group.shelfmarks.entries()).sort((a, b) => {
            if (a[0] === '—') return -1;
            if (b[0] === '—') return 1;
            return a[0].localeCompare(b[0]);
          });

          // Add shelfmarks
          sortedShelfmarks.forEach(([name, count]) => {
            const id = 'shelfmark-' + name.replace(/[^a-zA-Z0-9]/g, '-');
            const isChecked = selectedShelfmarks.has(name);
            const matches = !shelfmarksSearchTerm || name.toLowerCase().includes(shelfmarksSearchTerm);

            const $item = $(`
              <div class="checkbox-item shelfmark-item" style="display: ${matches ? 'flex' : 'none'};">
                <input type="checkbox" id="${id}" data-shelfmark="${name}" ${isChecked ? 'checked' : ''}>
                <label for="${id}">${name}</label>
              </div>
            `);
            $shelfmarksList.append($item);
          });
        });

        // Re-attach event handlers to new checkboxes
        $('#shelfmarksCheckboxList input[type="checkbox"]').off('change').on('change', function() {
          const shelfmarkName = $(this).data('shelfmark');
          if (this.checked) {
            // Add the selected shelfmark
            selectedShelfmarks.add(shelfmarkName);

            // Find all records that contain this shelfmark and auto-select their other shelfmarks
            table.rows().data().each(function(row) {
              const shelfmarksInRecord = getShelfmarksFromRecord(row);
              if (shelfmarksInRecord.includes(shelfmarkName)) {
                // Auto-select all other shelfmarks from this record
                shelfmarksInRecord.forEach(shelf => {
                  selectedShelfmarks.add(shelf);
                });
              }
            });
          } else {
            selectedShelfmarks.delete(shelfmarkName);
          }
          applyFilterChange();
        });
      }
      
      // Filter search input handlers (consolidated)
      const SEARCH_INPUT_HANDLERS = {
        '#shortTitlesSearch': updateShortTitlesList,
        '#personsSearch': updatePersonsList,
        '#placesSearch': updatePlacesList,
        '#functionsSearch': updateFunctionsList,
        '#shelfmarksSearch': updateShelfmarksList
      };

      Object.entries(SEARCH_INPUT_HANDLERS).forEach(([selector, updateFunc]) => {
        $(selector).on('input', updateFunc);
      });
      
      // Date slider functionality
      let isDraggingMin = false;
      let isDraggingMax = false;
      
      // Function to update filter button label and modal header count
      function updateFilterButtonLabel() {
        const activeFilters = [
          minDate !== minYear || maxDate !== maxYear,
          physicalTypeFilter !== 'both',
          fundamentaFilter !== 'both',
          selectedShortTitles.size > 0,
          selectedPersons.size > 0,
          selectedPlaces.size > 0,
          selectedFunctions.size > 0,
          selectedShelfmarks.size > 0
        ];
        const totalFilters = activeFilters.filter(Boolean).length;
        
        if (totalFilters > 0) {
          $('#filterBtn span').text(`${totalFilters} Filter${totalFilters !== 1 ? 's' : ''}`);
          $('#filterCount').html(`${totalFilters} filter${totalFilters !== 1 ? 's' : ''} selected`).show();
        } else {
          $('#filterBtn span').text('Filters');
          $('#filterCount').hide();
        }
      }

      // Function to update visual indicators on accordion titles
      function updateAccordionIndicators() {
        // Map of accordion IDs to their filter variables/sets
        const accordionFilters = {
          'shelfmarksAccordion': selectedShelfmarks.size > 0,
          'shortTitlesAccordion': selectedShortTitles.size > 0,
          'personsAccordion': selectedPersons.size > 0,
          'placesAccordion': selectedPlaces.size > 0,
          'functionsAccordion': selectedFunctions.size > 0,
          'physicalTypeContainer': physicalTypeFilter !== 'both',
          'fundamentaContainer': fundamentaFilter !== 'both',
          'dateWrapper': minDate !== minYear || maxDate !== maxYear
        };

        // Update each accordion
        Object.entries(accordionFilters).forEach(([accordionId, hasFilter]) => {
          const $accordion = $(`#${accordionId}`);

          if ($accordion.length) {
            // Toggle filter-active class on accordion (affects chevron styling)
            if (hasFilter) {
              $accordion.addClass('filter-active');
            } else {
              $accordion.removeClass('filter-active');
            }
          }
        });
      }

      function updateSliderDisplay() {
        const minPercent = ((minDate - minYear) / (maxYear - minYear)) * 100;
        const maxPercent = ((maxDate - minYear) / (maxYear - minYear)) * 100;

        $dateSliderHandleMin.css('left', minPercent + '%');
        $dateSliderHandleMax.css('left', maxPercent + '%');
        $dateSliderRange.css({
          'left': minPercent + '%',
          'right': (100 - maxPercent) + '%'
        });

        $('#minDateValue').text(minDate);
        $('#maxDateValue').text(maxDate);
        $('#minDateInput').val(minDate);
        $('#maxDateInput').val(maxDate);
      }
      
      function getYearFromPosition(clientX) {
        const trackRect = $dateSliderTrack[0].getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (clientX - trackRect.left) / trackRect.width));
        return Math.round(minYear + percent * (maxYear - minYear));
      }
      
      $dateSliderHandleMin.on('mousedown', function(e) {
        isDraggingMin = true;
        e.preventDefault();
      });
      
      $dateSliderHandleMax.on('mousedown', function(e) {
        isDraggingMax = true;
        e.preventDefault();
      });
      
      $(document).on('mousemove', function(e) {
        if (isDraggingMin) {
          const newMin = getYearFromPosition(e.clientX);
          if (minDate !== newMin && newMin < maxDate) {
            minDate = Math.min(newMin, maxDate - 1);
            updateSliderDisplay();
            table.draw();
          }
        } else if (isDraggingMax) {
          const newMax = getYearFromPosition(e.clientX);
          if (maxDate !== newMax && newMax > minDate) {
            maxDate = Math.max(newMax, minDate + 1);
            updateSliderDisplay();
            table.draw();
          }
        }
      });
      
      $(document).on('mouseup', function() {
        if (isDraggingMin || isDraggingMax) {
          updateFilterUI();
        }
        isDraggingMin = false;
        isDraggingMax = false;
      });
      
      // Initialize slider display
      updateSliderDisplay();

      // Initialize global search box from URL
      $('#globalSearch').val(urlParams.search);

      // Initialize Physical Type and Fundamenta buttons from URL
      setActiveSegmentButton('physicalTypeContainer', physicalTypeFilter);
      setActiveSegmentButton('fundamentaContainer', fundamentaFilter);

      // Now that filter variables are defined, update the global search handler to include URL params
      $('#globalSearch').off('input keyup change', globalSearchHandler);
      const originalHandler = globalSearchHandler;
      globalSearchHandler = function() {
        // Call the original handler
        originalHandler.call(this);
        // Add URL params update
        updateUrlParams(currentSearchTerm, getCurrentFilters());
      };

      $('#globalSearch').on('input keyup change', globalSearchHandler);

      // Configuration for checkbox lists
      const CHECKBOX_CONFIGS = [
        { set: () => selectedShortTitles, listId: 'shortTitlesCheckboxList', dataAttr: 'shorttitle' },
        { set: () => selectedPersons, listId: 'personsCheckboxList', dataAttr: 'person' },
        { set: () => selectedPlaces, listId: 'placesCheckboxList', dataAttr: 'place' },
        { set: () => selectedFunctions, listId: 'functionsCheckboxList', dataAttr: 'function' },
        { set: () => selectedShelfmarks, listId: 'shelfmarksCheckboxList', dataAttr: 'shelfmark' }
      ];

      // Helper to check checkboxes for a filter set
      const checkFilterBoxes = (set, listId, dataAttr) => {
        if (set.size > 0) {
          set.forEach(value => {
            $(`#${listId} input[data-${dataAttr}="${value}"]`).prop('checked', true);
          });
        }
      };

      // Helper to clear all filter sets
      function clearAllFilterSets() {
        selectedShortTitles.clear();
        selectedPersons.clear();
        selectedPlaces.clear();
        selectedFunctions.clear();
        selectedShelfmarks.clear();
      }

      // Helper to clear all checkboxes
      function clearAllCheckboxes() {
        CHECKBOX_CONFIGS.forEach(config => {
          $(`#${config.listId} input[type="checkbox"]`).prop('checked', false);
        });
      }

      // Apply filters from URL parameters on page load
      let urlFiltersApplied = false;
      table.one('draw', function() {
        setTimeout(function() {
          if (urlFiltersApplied) return;
          urlFiltersApplied = true;

          // Check the appropriate checkboxes based on URL params
          CHECKBOX_CONFIGS.forEach(config => {
            checkFilterBoxes(config.set(), config.listId, config.dataAttr);
          });

          updateFilterUI();

          if (currentSearchTerm) {
            globalSearchHandler.call($('#globalSearch')[0]);
          }
        }, 100);
      });

      // Date input handlers (consolidated)
      function createDateInputHandler(type) {
        return function() {
          const value = parseInt($(this).val());
          let isValid, currentValue;

          if (type === 'min') {
            isValid = value >= minYear && value < maxDate;
            currentValue = minDate;
            if (isValid) minDate = value;
          } else { // type === 'max'
            isValid = value <= maxYear && value > minDate;
            currentValue = maxDate;
            if (isValid) maxDate = value;
          }

          if (isValid) {
            updateSliderDisplay();
            table.draw();
            updateFilterUI();
          } else {
            $(this).val(currentValue);
          }
        };
      }

      $('#minDateInput').on('change', createDateInputHandler('min'));
      $('#maxDateInput').on('change', createDateInputHandler('max'));

      // Helper to toggle modal
      function toggleModal(show) {
        $('#filterModal').toggleClass('show', show);

        // Collapse all filter accordions when modal closes
        if (!show) {
          $('.filter-accordion').removeClass('expanded');
          $('.filter-accordion-content').css('max-height', '0');
        }
      }
      
      // Helper to update all filter UI elements (consolidated pattern)
      function updateFilterUI() {
        updateFilterButtonLabel();
        updateAccordionIndicators();
        updateUrlParams(currentSearchTerm, getCurrentFilters());
      }

      // Helper to apply filter changes
      function applyFilterChange() {
        table.draw();
        updateFilterUI();
      }
      
      // Modal open/close handlers
      $('#filterBtn').on('click', () => toggleModal(true));
      $('#closeModal, #applyFilters').on('click', () => toggleModal(false));
      
      // Close modal on overlay click
      $('#filterModal').on('click', (e) => {
        if ($(e.target).is('#filterModal')) toggleModal(false);
      });
      
      // Persons checkbox handler
      $('#personsCheckboxList').on('change', 'input[type="checkbox"]', function() {
        const person = $(this).data('person');
        selectedPersons[this.checked ? 'add' : 'delete'](person);
        applyFilterChange();
      });
      
      // Segmented button handler (handles both Physical type and Fundamenta)
      $('.segment-btn').on('click', function() {
        const $container = $(this).closest('[id$="Container"]');
        const value = $(this).data('value');
        const containerId = $container.attr('id');

        // Update button states
        setActiveSegmentButton(containerId, value);

        // Update filter value
        if (containerId === 'physicalTypeContainer') {
          physicalTypeFilter = value;
        } else if (containerId === 'fundamentaContainer') {
          fundamentaFilter = value;
        }

        applyFilterChange();
      });
      
      // Reset slider to default values
      function resetSlider() {
        minDate = minYear;
        maxDate = maxYear;
        updateSliderDisplay();
      }
      
      // Helper to set active segment button
      function setActiveSegmentButton(containerId, value) {
        const $container = $(`#${containerId}`);
        $container.find('.segment-btn').removeClass('active');
        $container.find(`.segment-btn[data-value="${value}"]`).addClass('active');
      }

      // Helper to reset all segment buttons to 'both'
      function resetAllSegmentButtons() {
        setActiveSegmentButton('physicalTypeContainer', 'both');
        setActiveSegmentButton('fundamentaContainer', 'both');
      }

      // Alias for backward compatibility
      function resetSegmentButtons() {
        resetAllSegmentButtons();
      }
      
      // Reset all filters to default values
      function resetAllFilters(resetSearch = false) {
        resetSlider();
        physicalTypeFilter = 'both';
        fundamentaFilter = 'both';
        clearAllFilterSets();
        manuallyHiddenContent.clear(); // Clear manually hidden content tracking
        resetSegmentButtons();
        clearAllCheckboxes();
        collapseAllDetails();
        $('#expandCollapseBtn').text('Expand All');
        isExpandAllActive = false; // Reset expand all state
        isDescCommentsOpen = false; // Reset descriptions/comments state

        // Reset logic toggles to AND (default)
        personsLogic = false;
        placesLogic = false;
        functionsLogic = false;
        $('#personsLogic, #placesLogic, #functionsLogic').prop('checked', false);

        // Collapse all filter accordions
        $('.filter-accordion').removeClass('expanded');
        $('.filter-accordion-content').css('max-height', '0');

        // Reset page length to default (25)
        table.page.len(25).draw();

        // Clear all child row data cache to force regeneration
        clearChildRowCache();

        if (resetSearch) {
          // Set flag to prevent search handler from running during reset
          isManualToggle = true;

          // Update search tracking variables
          lastSearchValue = '';
          currentSearchTerm = '';
          $('#globalSearch').val('');
          table.order([[1, 'asc']]).search('').rows().invalidate().draw();

          // Clear the flag after a delay
          setTimeout(() => {
            isManualToggle = false;
          }, 100);
        } else {
          table.rows().invalidate().draw();
        }

        updateFilterUI();
      }

      $('#clearFilters').on('click', () => resetAllFilters());
      $('#resetBtn').on('click', () => resetAllFilters(true));

      // Logic toggle handlers (consolidated)
      const LOGIC_TOGGLE_CONFIGS = [
        { selector: '#personsLogic', setLogic: (val) => personsLogic = val, updateFunc: updatePersonsList },
        { selector: '#placesLogic', setLogic: (val) => placesLogic = val, updateFunc: updatePlacesList },
        { selector: '#functionsLogic', setLogic: (val) => functionsLogic = val, updateFunc: updateFunctionsList }
      ];

      LOGIC_TOGGLE_CONFIGS.forEach(config => {
        $(config.selector).on('change', function() {
          config.setLogic(this.checked);
          if (config.updateFunc) {
            config.updateFunc();
          }
          table.draw();
          updateFilterUI();
        });
      });

      // Helper to set initial logic toggle states
      function setInitialLogicToggles() {
        const logicStates = {
          '#personsLogic': personsLogic,
          '#placesLogic': placesLogic,
          '#functionsLogic': functionsLogic
        };

        Object.entries(logicStates).forEach(([selector, value]) => {
          $(selector).prop('checked', value);
        });
      }

      // Set initial toggle states to match JavaScript variables
      setInitialLogicToggles();

      // Update filter button label and accordion indicators initially
      updateFilterButtonLabel();
      updateAccordionIndicators();
    })
    .catch(error => {
      console.error('Error loading data:', error);
    });
  
  // Scroll-based fade effect for search box
  window.addEventListener('scroll', function() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const fadeStart = 50;   // Start fading at 50px scroll
    const fadeEnd = 150;    // Complete fade at 150px scroll

    let opacity;
    if (scrollTop <= fadeStart) {
      opacity = 1;
    } else if (scrollTop >= fadeEnd) {
      opacity = 0;
    } else {
      opacity = 1 - (scrollTop - fadeStart) / (fadeEnd - fadeStart);
    }

    const searchContainer = document.querySelector('.global-search-container');
    if (searchContainer) {
      searchContainer.style.opacity = opacity;
    }
  });
});
