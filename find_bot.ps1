$procs = Get-WmiObject Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId, CommandLine
$procs | ForEach-Object {
    if ($_.CommandLine -like "*echoclaw*" -or $_.CommandLine -like "*index.ts*") {
        Write-Host "Found: PID $($_.ProcessId)"
        Write-Host "Command: $($_.CommandLine)"
        Write-Host ""
    }
}
