$(document).ready(function() {
  // Track manually hidden content
  const manuallyHiddenContent = new Set();
  let isManualToggle = false; // Flag to prevent search handler interference

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

  // State variables
  let table;
  let currentSearchTerm = ''; // Always empty; search/highlighting handled by elautedb.js
  let isExpandAllActive = false; // Track if "Expand All" is active
  let isDescCommentsOpen = false; // Track if descriptions/comments are open

  // Fetch data from Q1.json
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
        }
      });

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

      // Replace Feather icons after table is drawn
      table.on('draw', function() {
        feather.replace();

        // Save the expand all state BEFORE updateExpandCollapseButton changes it
        const wasExpandAllActive = isExpandAllActive;

        updateExpandCollapseButton();

        // If "Expand All" was active before this draw, expand all rows on the current page
        if (wasExpandAllActive && !isManualToggle) {
          // Use longer delay and requestAnimationFrame to ensure DOM is ready
          setTimeout(function() {
            requestAnimationFrame(function() {
              expandAllCurrentPageRows();
            });
          }, 100);
        }

        setTimeout(updateToggleDescCommentsBtn, 100);
      });

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
