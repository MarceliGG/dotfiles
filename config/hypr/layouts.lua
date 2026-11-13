hl.bind("SUPER + tab", function()
  local layouts   = { "master", "dwindle", "scrolling", "lua:grid" }
  local workspace = hl.get_active_workspace()
  if hl.get_active_special_workspace() then
    workspace = hl.get_active_special_workspace()
  end

  local next_layout = "dwindle"

  if not workspace then
    return
  end

  for i = 1, #layouts do
    if layouts[i] == workspace.tiled_layout then
      local next_layout_idx = (i % #layouts) + 1
      next_layout = layouts[next_layout_idx]
      break
    end
  end

  if workspace.special then
    hl.workspace_rule({ workspace = tostring(workspace.name), layout = next_layout })
  else
    hl.workspace_rule({ workspace = tostring(workspace.id), layout = next_layout })
  end
end)

hl.layout.register("grid", {
  recalculate = function(ctx)
    local n = #ctx.targets
    if n == 0 then
      return
    end

    local cols = math.ceil(math.sqrt(n))
    local rows = math.ceil(n / cols)

    local last = n % cols

    if (last == 0) then
      for i, target in ipairs(ctx.targets) do
        target:place(ctx:grid_cell(i, cols))
      end
    else
      for i = 1, #ctx.targets - last do
        ctx.targets[i]:place(ctx:grid_cell(i, cols))
      end

      local row = ctx:row(rows, rows)

      for i = 1, last do
        local box = ctx:column(i, last)
        box.h = row.h
        box.y = row.y
        ctx.targets[n - last + i]:place(box)
      end
    end
  end,
})
