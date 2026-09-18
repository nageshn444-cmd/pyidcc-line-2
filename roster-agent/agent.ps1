$ErrorActionPreference = 'Stop'
$HomeDir = Join-Path $env:LOCALAPPDATA 'PYIDCC-RosterAgent'
$ConfigPath = Join-Path $HomeDir 'config.json'
$StatePath = Join-Path $HomeDir 'state.json'
$LogPath = Join-Path $HomeDir 'agent.log'
New-Item -ItemType Directory -Force -Path $HomeDir | Out-Null
function Log($m) { Add-Content -Path $LogPath -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' | ' + $m) -Encoding UTF8 }
function Config { if (-not (Test-Path $ConfigPath)) { throw ('Missing ' + $ConfigPath) }; Get-Content -Raw $ConfigPath | ConvertFrom-Json }
$c=Config; $root=[string]$c.rosterRoot; if ([string]::IsNullOrWhiteSpace($root)){$root='E:\1) Rosters'}
$url=[string]$c.functionUrl; $token=[string]$c.agentToken; $poll=[int]$c.pollSeconds; if($poll -lt 30){$poll=60}; $agentId=[string]$c.agentId; if(!$agentId){$agentId=$env:COMPUTERNAME}
function Schedule([datetime]$d){switch([int]$d.DayOfWeek){0{'SUNDAY'}1{'MONDAY'}6{'SATURDAY'}default{'WEEKDAY'}}}
function Sheets([datetime]$d){$dd=$d.Day;$mm=$d.Month; @("$dd.$mm","$dd-$mm","$dd`_$mm","$dd.$('{0:D2}' -f $mm)","$dd-$('{0:D2}' -f $mm)","$dd`_$('{0:D2}' -f $mm)",("{0:D2}.{1:D2}" -f $dd,$mm),("{0:D2}-{1:D2}" -f $dd,$mm)) | Select-Object -Unique}
function CandidateFiles($yearRoot){if(-not(Test-Path $yearRoot)){return @()}; @(Get-ChildItem $yearRoot -Recurse -File -ErrorAction SilentlyContinue | Where-Object {$_.Extension -match '^\.(xlsb|xlsx|xls)$' -and $_.Name -match '(?i)roster'} | Sort-Object LastWriteTime -Descending)}
function ReadRoster($path,[datetime]$date){
  $excel=$null;$wb=$null
  try{
    $excel=New-Object -ComObject Excel.Application;$excel.Visible=$false;$excel.DisplayAlerts=$false;$excel.AutomationSecurity=3
    $wb=$excel.Workbooks.Open($path,0,$true)
    $sheet=$null; foreach($s in $wb.Worksheets){if((Sheets $date) -contains [string]$s.Name){$sheet=$s;break}}
    if(-not $sheet){foreach($s in $wb.Worksheets){foreach($x in (Sheets $date)){if(([string]$s.Name) -like ('*'+$x+'*')){$sheet=$s;break}};if($sheet){break}}}
    if(-not $sheet){throw 'No worksheet matching today was found.'}
    $used=$sheet.UsedRange;$rows=[int]$used.Rows.Count;$cols=[int]$used.Columns.Count;$v=$used.Value2
    if($rows -lt 1){throw 'Today worksheet is empty.'}
    function V($r,$col){try{if($rows -eq 1 -and $cols -eq 1){if($r -eq 1 -and $col -eq 1){return $v}};return $v.GetValue($r,$col)}catch{return $null}}
    $hr=-1;$dc=1;$nc=5;$ec=6;$pc=-1;$tc=-1
    for($r=1;$r -le [Math]::Min(25,$rows);$r++){
      $cells=1..$cols | ForEach-Object {[string](V $r $_)}
      $low=$cells | ForEach-Object {$_.Trim().ToLowerInvariant()}
      $hd=@($low|?{$_ -like '*duty*'}).Count -gt 0;$hn=@($low|?{$_ -like '*name*' -or $_ -like '*operator*' -or $_ -eq 'to' -or $_ -eq 't.o' -or $_ -eq 't.o.'}).Count -gt 0;$he=@($low|?{$_ -like '*emp*' -or $_ -like '*employee*' -or $_ -eq 'id'}).Count -gt 0
      if(($hd -and ($hn -or $he)) -or ($hn -and $he)){$hr=$r;for($col=1;$col -le $cols;$col++){$h=([string](V $r $col)).Trim().ToLowerInvariant();if($h -like '*duty*'){$dc=$col}elseif($h -like '*train*' -or $h -like '*rake*'){$tc=$col}elseif($h -like '*name*' -or $h -like '*operator*' -or $h -eq 'to' -or $h -eq 't.o' -or $h -eq 't.o.'){$nc=$col}elseif($h -like '*emp*' -or $h -like '*employee*' -or $h -eq 'id'){$ec=$col}elseif($h -like '*pattern*' -or $h -like '*trip*'){$pc=$col}};break}
    }
    $start=if($hr -gt 0){$hr+1}else{1};$duties=@()
    for($r=$start;$r -le $rows;$r++){$d=[string](V $r $dc);if([string]::IsNullOrWhiteSpace($d)){continue};$d=$d.Trim();if($d -match '^[1-9]$'){$d='0'+$d};$n=[string](V $r $nc);$e=[string](V $r $ec);if($e -notmatch '^\d+$' -and $n -match '^\d+$'){$t=$e;$e=$n;$n=$t};$train=$null;if($tc -gt 0){$tv=[string](V $r $tc);if($tv -match '^\d+$'){$train=[int]$tv}};$short=$false;if($pc -gt 0){$short=([string](V $r $pc)).ToUpperInvariant().Contains('SHORT')};if($n.Trim() -or $e.Trim()){$duties+=,[pscustomobject]@{dutyNo=$d;employeeId=$e.Trim();name=$n.Trim();isShortLoop=$short;trainId=$train}}}
    if($duties.Count -eq 0){throw 'No duty rows extracted.'};return [pscustomobject]@{sheetName=[string]$sheet.Name;duties=$duties}
  }finally{if($wb){try{$wb.Close($false)}catch{};[Runtime.InteropServices.Marshal]::ReleaseComObject($wb)|Out-Null};if($excel){try{$excel.Quit()}catch{};[Runtime.InteropServices.Marshal]::ReleaseComObject($excel)|Out-Null};[GC]::Collect();[GC]::WaitForPendingFinalizers()}
}
function Sync{
 $now=Get-Date;$yr=Join-Path $root ([string]$now.Year);if(-not(Test-Path $root)){Log ('ERROR root missing: '+$root);return};if(-not(Test-Path $yr)){Log ('WAIT year folder missing: '+$yr);return};$files=CandidateFiles $yr;if($files.Count -eq 0){Log ('WAIT no roster files: '+$yr);return}
 $selected=$null;$parsed=$null;foreach($f in $files){try{$p=ReadRoster $f.FullName $now;if($p.duties.Count -gt 0){$selected=$f;$parsed=$p;break}}catch{}}
 if(-not $selected){Log 'WAIT no valid current-date roster sheet';return};if(((Get-Date)-$selected.LastWriteTime).TotalSeconds -lt 10){return};$hash=(Get-FileHash $selected.FullName -Algorithm SHA256).Hash.ToLowerInvariant();$st=$null;if(Test-Path $StatePath){try{$st=Get-Content -Raw $StatePath|ConvertFrom-Json}catch{}};if($st -and $st.selectedDate -eq $now.ToString('yyyy-MM-dd') -and $st.sha256 -eq $hash -and $st.status -eq 'DEPLOYED'){return}
 $bytes=[IO.File]::ReadAllBytes($selected.FullName);$payload=@{metadata=@{selectedDate=$now.ToString('yyyy-MM-dd');scheduleType=(Schedule $now);sourcePath=$selected.FullName;fileName=$selected.Name;sheetName=$parsed.sheetName;sha256=$hash;agentId=$agentId;machineName=$env:COMPUTERNAME};duties=@($parsed.duties);originalFile=@{name=$selected.Name;base64=[Convert]::ToBase64String($bytes)}}|ConvertTo-Json -Depth 8 -Compress
 for($a=1;$a -le 3;$a++){try{$h=@{'x-pyidcc-agent-token'=$token};$r=Invoke-RestMethod -Uri $url -Method Post -Headers $h -ContentType 'application/json' -Body $payload -TimeoutSec 120;if($r.ok -and ($r.status -eq 'DEPLOYED' -or $r.status -eq 'ALREADY_DEPLOYED')){$o=@{status='DEPLOYED';selectedDate=$now.ToString('yyyy-MM-dd');filePath=$selected.FullName;fileName=$selected.Name;sheetName=$parsed.sheetName;sha256=$hash;deployedAt=(Get-Date).ToString('o')};$o|ConvertTo-Json|Set-Content $StatePath -Encoding UTF8;Log ('SUCCESS '+$r.status+' duties='+$r.dutyCount+' tracks='+$r.trackWrites);return};throw 'Cloud response was unsuccessful.'}catch{Log ('RETRY '+$a+'/3 '+$_.Exception.Message);Start-Sleep -Seconds (10*$a)}}
}
Log ('START root='+$root+' agent='+$agentId)
while($true){try{Sync}catch{Log ('UNHANDLED '+$_.Exception.Message)};Start-Sleep -Seconds $poll}
