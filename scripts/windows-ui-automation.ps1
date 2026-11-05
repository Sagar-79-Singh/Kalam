# Accessibility-only driver for the installed app. No debug port, injected app
# bindings, replacement webview, browser download, or production test hooks.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class KalamAutomation {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
}
'@

function Get-ApplicationWindow([int] $ApplicationId) {
    $condition = New-Object System.Windows.Automation.AndCondition(
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $ApplicationId)),
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsOffscreenProperty, $false))
    )
    $window = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
    if ($null -eq $window) { throw "The installed application's visible window is not ready." }
    return $window
}

function Get-VisibleNames($Root) {
    $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsOffscreenProperty, $false)
    $elements = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
    $names = New-Object System.Collections.Generic.List[string]
    foreach ($element in $elements) {
        $name = $element.Current.Name
        if ($name) { $names.Add($name) }
        if ($names.Count -ge 700) { break }
    }
    return ($names -join "`n")
}

function Get-Target($Root, $Request) {
    $conditions = New-Object 'System.Collections.Generic.List[System.Windows.Automation.Condition]'
    if (-not $Request.contains) {
        $conditions.Add((New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, [string]$Request.name)))
    }
    if ($Request.role -eq 'button') {
        $conditions.Add((New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)))
    } elseif ($Request.role -eq 'input') {
        $conditions.Add((New-Object System.Windows.Automation.OrCondition(
            (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)),
            (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ComboBox))
        )))
    }
    if ($conditions.Count -eq 0) { $condition = [System.Windows.Automation.Condition]::TrueCondition }
    elseif ($conditions.Count -eq 1) { $condition = $conditions[0] }
    else { $condition = [System.Windows.Automation.AndCondition]::new($conditions.ToArray()) }
    $elements = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
    foreach ($element in $elements) {
        if ($Request.contains -and -not $element.Current.Name.Contains([string]$Request.name)) { continue }
        if (-not $element.Current.IsEnabled) { continue }
        return $element
    }
    throw "Visible enabled $($Request.role) '$($Request.name)' was not found."
}

while ($null -ne ($line = [Console]::ReadLine())) {
    $request = $null
    try {
        $request = ConvertFrom-Json -InputObject $line
        $root = Get-ApplicationWindow -ApplicationId $request.processId
        $value = $true
        switch ($request.action) {
            'snapshot' { $value = Get-VisibleNames -Root $root }
            'click' {
                $target = Get-Target -Root $root -Request $request
                $scroll = $null
                if ($target.TryGetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern, [ref]$scroll)) { $scroll.ScrollIntoView() }
                $pattern = $null
                if ($target.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { $pattern.Invoke() }
                else { $target.SetFocus(); [System.Windows.Forms.SendKeys]::SendWait('{ENTER}') }
            }
            'fill' {
                $target = Get-Target -Root $root -Request $request
                $pattern = $null
                if (-not $target.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) { throw 'The input does not expose its accessibility value pattern.' }
                $target.SetFocus()
                $pattern.SetValue([string]$request.text)
            }
            'keys' {
                [void][KalamAutomation]::SetForegroundWindow([IntPtr]$root.Current.NativeWindowHandle)
                $root.SetFocus()
                [System.Windows.Forms.SendKeys]::SendWait([string]$request.keys)
            }
            'pressed' {
                $target = Get-Target -Root $root -Request $request
                $pattern = $target.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
                $value = $pattern.Current.ToggleState -eq [System.Windows.Automation.ToggleState]::On
            }
            'maximize' { $root.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).SetWindowVisualState([System.Windows.Automation.WindowVisualState]::Maximized) }
            'close' { $root.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close() }
            'screenshot' {
                [void][KalamAutomation]::ShowWindow([IntPtr]$root.Current.NativeWindowHandle, 1)
                [void][KalamAutomation]::SetForegroundWindow([IntPtr]$root.Current.NativeWindowHandle)
                Start-Sleep -Milliseconds 150
                $bounds = $root.Current.BoundingRectangle
                $bitmap = New-Object System.Drawing.Bitmap([int]$bounds.Width, [int]$bounds.Height)
                $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
                try {
                    $graphics.CopyFromScreen([int]$bounds.Left, [int]$bounds.Top, 0, 0, $bitmap.Size)
                    $bitmap.Save([string]$request.file, [System.Drawing.Imaging.ImageFormat]::Png)
                    $pixel = $bitmap.GetPixel([Math]::Max(0, $bitmap.Width - 14), [int]($bitmap.Height / 2))
                    $value = @{ red = [int]$pixel.R; green = [int]$pixel.G; blue = [int]$pixel.B }
                } finally { $graphics.Dispose(); $bitmap.Dispose() }
            }
            default { throw "Unknown accessibility action: $($request.action)" }
        }
        $result = @{ id = $request.id; ok = $true; value = $value }
    } catch { $result = @{ id = $request.id; ok = $false; error = $_.Exception.Message } }
    [Console]::WriteLine((ConvertTo-Json -InputObject $result -Depth 6 -Compress))
}
