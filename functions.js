function debug(msg) {
  $('#debug:visible').html('<b>' + new Date() + ':</b>\n' + htmlspecialchars(msg));
}

function error(msg) {
  if($.browser.msie) {
    alert('Error: ' + msg);
  }
  throw new Error(msg);
}

function showDialog(url, width, height) {
  var w = Math.min(parseInt(width),  $(window).width()  - 40);
  var h = Math.min(parseInt(height), $(window).height() - 40);
  var px = function(n) {
    return Math.round(n) + 'px';
  };
  $('#dialog')
  .html('<iframe src="' + htmlspecialchars(url) + '" />')
  .css({
    width: px(w),
    height: px(h),
    marginLeft: px(-w/2),
    marginTop: px(-h/2)
  }).jqmShow();
}

function onHideDialog(h) {
  if(typeof window.hideDialogCallback == 'function') {
    var result = window.hideDialogCallback();
    window.hideDialogCallback = null;
    if(!result) {
      return;
    }
  }
  h.w.hide();
  if(h.o) {
    h.o.remove();
  }
}

function hideDialog(doUpdate) {
  $('#dialog').jqmHide();
  if(doUpdate) {
    updateTorrentsNow();
  }
}

function updateTorrentsNow() {
  window.clearInterval(current.refreshIntervalID);
  updateTorrentsData();
  current.refreshIntervalID = window.setInterval(updateTorrentsData, config.refreshInterval);
}

// format a number of bytes nicely
function formatBytes(bytes, zero, after) {
  if(zero === undefined) {
    zero = '';
  }
  if(after === undefined) {
    after = '';
  }
  if(!bytes) {
    return zero;
  }
  var units = ['B','KB','MB','GB','TB','PB'];
  var i = 0;
  while(bytes >= 1000) {
      i++;
      bytes /= 1024;
  }
  return number_format(bytes, (i ? 1 : 0), '.', ',') + ' ' + units[i] + after;
}




// Functions to update torrents list

function updateTorrentsData() {
  $.get('json.php', function(d) {
    var changes = false;
    try {
      changes = JSON.parse(d);
    } catch(_) {
      $('#error').html(current.error = d).show();
      return false;
    }
    
    if(current.error) {
      current.error = false;
      $('#error').hide();
    }
    
    if(!changes) {
      debug('(No changes)');
      return;
    }
    debug(JSON.stringify(changes, null, 2));
    
    $.extend(true, window.data, changes);
    updateTorrentsHTML(changes, false);
  });
}

function updateTorrentsHTML(changes, isFirstUpdate) {
  var dirty = {
    mustSort: !!isFirstUpdate,
    toFilter: [],
    toCheckView: [],
    stripes: !!isFirstUpdate,
    positions: !!isFirstUpdate,
    addedTorrents: false
  };
  var firstHTML = '';
  
  if(changes.torrents) {
    // One or more torrents changed
    for(var hash in changes.torrents) {
      if(changes.torrents[hash] === null) {
        // A torrent was removed
        $('#' + hash).remove();
        dirty.stripes = true;
        dirty.positions = true;
      } else {
        var mustRewriteHTML = false;
        if(isFirstUpdate || !window.data.torrents[hash]) {
          mustRewriteHTML = true;
        }
        if(!mustRewriteHTML) {
          for(var varName in changes.torrents[hash]) {
            if(templates.torrent.mustRewriteHTML[varName]) {
              mustRewriteHTML = true;
              break;
            }
          }
        }
        var checkChangedVars = false;
        if(mustRewriteHTML) {
          dirty.stripes = true;
          var html = applyTemplate(window.data.torrents[hash], templates.torrent, hash, 't');
          var container = $('#' + hash);
          if(container.length) {
            var checked = $('#t-' + hash + '-checkbox').attr('checked');
            container.html(html);
            if(checked) {
              $('#t-' + hash + '-checkbox').attr('checked', true);
            }
            checkChangedVars = true;
          } else {
            window.data.torrents[hash].visible = true;
            html =
              '<div class="torrent-container" id="' + hash + '">\n'
              + html + '\n</div>\n\n';
            if(isFirstUpdate) {
              firstHTML += html;
            } else {
              $('#torrents').append(html);
              dirty.toCheckView.push(hash);
              dirty.toFilter.push(hash);
              dirty.mustSort = true;
              dirty.positions = true;
              dirty.addedTorrents = true;
            }
          }
        } else {
          for(var varName in changes.torrents[hash]) {
            var el = $('#t-' + hash + '-' + varName)[0];
            var val = getFormattedValue(varName, window.data.torrents[hash][varName], el);
            $(el).html(val);
            checkChangedVars = true;
          }
        }
        if(checkChangedVars) {
          for(var varName in changes.torrents[hash]) {
            if(viewHandlers.varsToCheck[varName]) {
              dirty.toCheckView.push(hash);
            }
            if(current.filters[varName]) {
              dirty.toFilter.push(hash);
            }
            if(current.sortVar == varName) {
              dirty.mustSort = true;
            }
          }
        }
      }
    }
    
    if(isFirstUpdate) {
      $('#torrents').append(firstHTML);
    }
    
    var torrentDivsAll = $('#torrents>div.torrent-container');
    $('#t-count-all').html(torrentDivsAll.length);
    
    if(isFirstUpdate) {
      // dirty.stripes, dirty.positions are already true
      updateVisibleTorrents(torrentDivsAll, true);
      sortTorrents(torrentDivsAll);
    } else {
      var opts = {
        filter: dirty.toFilter,
        checkView: dirty.toCheckView,
        addedTorrents: dirty.addedTorrents
      };
      if(updateVisibleTorrents(torrentDivsAll, opts)) {
        dirty.stripes = true;
      }
      if(dirty.mustSort && sortTorrents(torrentDivsAll)) {
        dirty.stripes = true;
        dirty.positions = true;
      }
    }
    
    // set row classes
    if(dirty.stripes) {
      resetStripes();
    }
    
    // update current positions
    if(dirty.positions) {
      updateTorrentPositions();
    }
  }
  
  // update global items (total speeds, caps, disk space, etc.)
  for(var k in changes) {
    if(k != 'torrents') {
      var el = document.getElementById(k);
      $(el).html(getFormattedValue(k, changes[k], el));
    }
  }
}



var viewHandlers = {
  varsToCheck: {
    state: true,
    is_transferring: true,
    complete: true
  },
  
  'main': function(t) {
    return true;
  },
  'started': function(t) {
    return t.state;
  },
  'stopped': function(t) {
    return !t.state;
  },
  'active': function(t) {
    return t.is_transferring;
  },
  'inactive': function(t) {
    return !t.is_transferring;
  },
  'complete': function(t) {
    return t.complete;
  },
  'incomplete': function(t) {
    return !t.complete;
  },
  'seeding': function(t) {
    return t.complete && t.state;
  }
}


function sortTorrents(torrentDivsAll, reorderAll) {
  if(!current.sortVar) {
    // no sort order is defined
    return false;
  }
  if(!torrentDivsAll) {
    torrentDivsAll = $('#torrents>div.torrent-container');
  }
  var runs = [];
  var els = torrentDivsAll.toArray();
  var len = els.length;
  
  for(var i = 0; i < len; i++) {
    // set the before-sort position to ensure a stable sort
    window.data.torrents[els[i].id].sortPos = i;
  }
  
  var toMove = [];
  var anyVisibleMoved = false;
  var elsSorted = null;
  
  if(reorderAll) {
    
    els.sort(getTorrentsComparer());
    elsSorted = els;
    
  } else {
    
    var result = patienceSort(els, getTorrentsComparer());
    elsSorted = result.sorted;
    
    if(result.subseq.length == len) {
      // the list was already sorted
      return false;
    }
    
    // figure out which divs to move, and where
    toMove = new Array(len - result.subseq.length);
    if(toMove.length >= len - 5) {
      
      /* if we can avoid 5 or more moves, do it; otherwise, just
       * reorder everything
       */
      reorderAll = true;
      
    } else {
      
      var iSubseq = 0, subseqLen = result.subseq.length;
      var iToMove = 0, after = 't-none';
      for(var i = 0; i < len; i++) {
        var item = result.sorted[i];
        if(iSubseq < subseqLen && item.id == result.subseq[iSubseq].id) {
          iSubseq++;
        } else {
          if(!anyVisibleMoved && data.torrents[item.id].visible) {
            anyVisibleMoved = true;
          }
          toMove[iToMove++] = {
            after: after,
            item: item
          };
        }
        after = item.id;
      }
    }
  }
  
  if(reorderAll) {
    // [almost] everything was reordered, so just reorder everything
    var t = $('#torrents');
    $(elsSorted).each(function() {
      t.append(this);
    });
  } else {
    for(var i = 0; i < toMove.length; i++) {
      var move = toMove[i];
      $('#' + move.after).after(move.item);
    }
  }
  
  return reorderAll || anyVisibleMoved;
}

function updateVisibleTorrents(torrentDivsAll, ids) {
  if(!torrentDivsAll) {
    torrentDivsAll = $('#torrents>div.torrent-container');
  }
  var isFirstUpdate = false;
  if(ids === true) {
    isFirstUpdate = true;
    ids = null;
  }
  var anyChanged = false;
  
  var actions = {
    checkView: function(id) {
      return viewHandlers[current.view](data.torrents[id]);
    },
    filter: function(id) {
      for(var f in current.filters) {
        // TODO: fill in filtering logic (return false if no match)
      }
      return true;
    }
  };
  
  var canStop = true;
  var checkAll = {}, indices = {};
  for(var a in actions) {
    checkAll[a] = (!ids || (ids[a] && !$.isArray(ids[a])));
    if(checkAll[a] || (ids && ids[a] && ids[a].length)) {
      canStop = false;
    }
    indices[a] = 0;
  }
  
  if(canStop) {
    return false;
  }
  
  torrentDivsAll.each(function() {
    var checkState = false, shouldShow = true;
    
    for(var a in actions) {
      if(checkAll[a] || (ids[a] && ids[a][indices[a]] == this.id)) {
        checkState = true;
        indices[a]++;
        if(shouldShow && !actions[a](this.id)) {
          shouldShow = false;
          break;
        }
      }
    }
    
    if(checkState && shouldShow != data.torrents[this.id].visible) {
      anyChanged = true;
      $(this).css('display', shouldShow ? '' : 'none');
      data.torrents[this.id].visible = shouldShow;
    }
  });
  
  if(anyChanged || isFirstUpdate || (ids && ids.addedTorrents)) {
    var torrentDivsVisible = torrentDivsAll.filter(function() {
      return data.torrents[this.id].visible;
    });
    $('#t-none').css('display', (torrentDivsVisible.length ? 'none' : ''));
    $('#t-count-visible').html(torrentDivsVisible.length);
  }
  return anyChanged;
}

function updateTorrentPositions() {
  var i = 0;
  current.torrentHashes = [];
  $('#torrents>div.torrent-container').each(function() {
    var h = this.id;
    if(window.data.torrents[h].visible) {
      current.torrentHashes[i] = h;
      window.data.torrents[h].pos = i;
      i++;
    } else {
      window.data.torrents[h].pos = -1;
    }
  });
}

function getTorrentsComparer() {
  var cmp = (current.sortDesc ? -1 : 1);
  return function(a, b) {
    var ta = window.data.torrents[a.id];
    var tb = window.data.torrents[b.id];
    var va = ta[current.sortVar];
    var vb = tb[current.sortVar];
    if(va.toLowerCase) va = va.toLowerCase();
    if(vb.toLowerCase) vb = vb.toLowerCase();
    return (va < vb ? -cmp : (va > vb ? cmp : ta.sortPos - tb.sortPos));
  };
}    

function resetStripes(torrentDivsVisible) {
  if(!torrentDivsVisible) {
    torrentDivsVisible = $('#torrents>div.torrent-container').filter(function() {
      return data.torrents[this.id].visible;
    });
  }
  var row1 = true;
  torrentDivsVisible.each(function() {
    $(this)
    .addClass(row1 ? 'row1' : 'row2')
    .removeClass(row1 ? 'row2' : 'row1');
    row1 = !row1;
  });
}

function setCurrentSort(sortInfo, obj) {
  if(!obj) {
    obj = $('#torrents-header a.sort[rel=' + sortInfo + ']');
  }
  var arr = sortInfo.split(':');
  var reversing = false;
  if(arr[0] == current.sortVar) {
    reversing = true;
    current.sortDesc = !current.sortDesc;
  } else {
    current.sortVar = arr[0];
    current.sortDesc = (arr[1] == 'desc');
  }
  $('#torrents-header a.sort').attr('class', 'sort');
  obj.addClass(current.sortDesc ? 'sort-desc' : 'sort-asc');
  if(sortTorrents(null, arr.length > 2 && reversing)) {
    resetStripes();
    updateTorrentPositions();
  }
}

function setCurrentView(viewName, obj) {
  if(current.view == viewName) {
    return;
  }
  if(!obj) {
    obj = $('#navlist a.view[rel=' + viewName + ']');
  }
  current.view = viewName;
  $('#navlist a.view').attr('class', 'view');
  obj.addClass('current');
  if(updateVisibleTorrents()) {
    resetStripes();
  }
}

// ----------- Original rtGui functions

function checkAll(field) {
   for (i = 0; i < field.length; i++)
	   field[i].checked = true ;
}

function uncheckAll(field) {
   for (i = 0; i < field.length; i++)
	   field[i].checked = false ;
}

function toggleLayer( whichLayer ) {
  var elem, vis;
  if( document.getElementById ) 
    elem = document.getElementById( whichLayer );
  else if( document.all ) 
      elem = document.all[whichLayer];
  else if( document.layers )
    elem = document.layers[whichLayer];
  vis = elem.style;
  if(vis.display==''&&elem.offsetWidth!=undefined&&elem.offsetHeight!=undefined)
    vis.display = (elem.offsetWidth!=0&&elem.offsetHeight!=0)?'block':'none';
  vis.display = (vis.display==''||vis.display=='block')?'none':'block';
}
