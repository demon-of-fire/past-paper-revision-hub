$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root "dist"
$buildRoot = Join-Path ([IO.Path]::GetTempPath()) "pprh-installer-build"
$payload = Join-Path $buildRoot "payload"
$setupExe = Join-Path $dist "PastPaperRevisionHubSetup.exe"
$latestExe = Join-Path $root "PastPaperRevisionHubSetup-LATEST.exe"
$oldRootExe = Join-Path $root "PastPaperRevisionHubSetup.exe"
$buildSetupExe = Join-Path $buildRoot "PastPaperRevisionHubSetup.exe"
$payloadZip = Join-Path $buildRoot "payload.zip"
$installerSource = Join-Path $buildRoot "PastPaperRevisionHubSetup.cs"

New-Item -ItemType Directory -Force -Path $dist | Out-Null
Remove-Item -LiteralPath $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $payload | Out-Null

foreach ($file in @("index.html", "styles.css", "app.js", "server.js", "package.json", "requirements.txt", "README.md")) {
  Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $payload $file) -Force
}

Copy-Item -LiteralPath (Join-Path $root "data\real-papers.json") -Destination (Join-Path $payload "real-papers.json") -Force

Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $payload -File).FullName -DestinationPath $payloadZip -Force
$payloadBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($payloadZip))

$source = @"
using Microsoft.Win32;
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public static class Program
{
    public const string AppName = "Past Paper Revision Hub";
    public const string PayloadZipBase64 = @"$payloadBase64";
    public const string NodeVersion = "22.16.0";
    public const string PythonVersion = "3.12.10";

    [STAThread]
    public static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        if (args.Length > 0 && args[0].Equals("--finish-uninstall", StringComparison.OrdinalIgnoreCase))
        {
            string root = args.Length > 1 ? args[1] : Installer.DefaultInstallRoot;
            Application.Run(new UninstallForm(root, true));
            return;
        }

        if (args.Length > 0 && args[0].Equals("--uninstall", StringComparison.OrdinalIgnoreCase))
        {
            Application.Run(new UninstallForm(Installer.DefaultInstallRoot, false));
            return;
        }

        Application.Run(new InstallForm());
    }
}

public sealed class InstallForm : Form
{
    private readonly TextBox folderBox;
    private readonly Button browseButton;
    private readonly Button installButton;
    private readonly Button closeButton;
    private readonly Label statusLabel;
    private readonly ProgressBar progressBar;
    private readonly TextBox logBox;

    public InstallForm()
    {
        Text = Program.AppName + " Setup";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(620, 470);
        Size = new Size(720, 540);
        Font = new Font("Segoe UI", 10F);

        Label title = new Label();
        title.Text = Program.AppName + " Setup";
        title.Font = new Font(Font.FontFamily, 18F, FontStyle.Bold);
        title.AutoSize = true;
        title.Location = new Point(24, 22);

        Label description = new Label();
        description.Text = "Choose where to install the revision hub, then start setup.";
        description.AutoSize = true;
        description.Location = new Point(27, 62);

        Label folderLabel = new Label();
        folderLabel.Text = "Install folder";
        folderLabel.AutoSize = true;
        folderLabel.Location = new Point(27, 105);

        folderBox = new TextBox();
        folderBox.Text = Installer.DefaultInstallRoot;
        folderBox.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        folderBox.Location = new Point(30, 130);
        folderBox.Width = 520;
        folderBox.AccessibleName = "Install folder";

        browseButton = new Button();
        browseButton.Text = "Browse...";
        browseButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        browseButton.Location = new Point(565, 128);
        browseButton.Size = new Size(115, 32);
        browseButton.AccessibleName = "Browse for install folder";
        browseButton.Click += BrowseButton_Click;

        statusLabel = new Label();
        statusLabel.Text = "Ready to install.";
        statusLabel.AutoSize = true;
        statusLabel.Location = new Point(27, 178);
        statusLabel.AccessibleName = "Setup status";

        progressBar = new ProgressBar();
        progressBar.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        progressBar.Location = new Point(30, 206);
        progressBar.Size = new Size(650, 24);
        progressBar.Style = ProgressBarStyle.Continuous;
        progressBar.AccessibleName = "Setup progress";

        logBox = new TextBox();
        logBox.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        logBox.Location = new Point(30, 248);
        logBox.Size = new Size(650, 185);
        logBox.Multiline = true;
        logBox.ReadOnly = true;
        logBox.ScrollBars = ScrollBars.Vertical;
        logBox.AccessibleName = "Setup details";

        installButton = new Button();
        installButton.Text = "Install";
        installButton.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        installButton.Location = new Point(440, 452);
        installButton.Size = new Size(115, 36);
        installButton.AccessibleName = "Install";
        installButton.Click += InstallButton_Click;

        closeButton = new Button();
        closeButton.Text = "Close";
        closeButton.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        closeButton.Location = new Point(565, 452);
        closeButton.Size = new Size(115, 36);
        closeButton.AccessibleName = "Close setup";
        closeButton.Click += delegate { Close(); };

        Controls.Add(title);
        Controls.Add(description);
        Controls.Add(folderLabel);
        Controls.Add(folderBox);
        Controls.Add(browseButton);
        Controls.Add(statusLabel);
        Controls.Add(progressBar);
        Controls.Add(logBox);
        Controls.Add(installButton);
        Controls.Add(closeButton);

        AcceptButton = installButton;
        CancelButton = closeButton;
    }

    private void BrowseButton_Click(object sender, EventArgs e)
    {
        using (FolderBrowserDialog dialog = new FolderBrowserDialog())
        {
            dialog.Description = "Choose the install folder";
            dialog.SelectedPath = folderBox.Text;
            dialog.ShowNewFolderButton = true;
            if (dialog.ShowDialog(this) == DialogResult.OK)
            {
                folderBox.Text = dialog.SelectedPath;
            }
        }
    }

    private void InstallButton_Click(object sender, EventArgs e)
    {
        string folder = Environment.ExpandEnvironmentVariables(folderBox.Text.Trim().Trim('"'));
        if (string.IsNullOrWhiteSpace(folder))
        {
            MessageBox.Show(this, "Choose an install folder first.", Program.AppName + " Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        installButton.Enabled = false;
        browseButton.Enabled = false;
        folderBox.Enabled = false;
        closeButton.Enabled = false;
        progressBar.Style = ProgressBarStyle.Marquee;
        progressBar.MarqueeAnimationSpeed = 30;
        logBox.Clear();

        BackgroundWorker worker = new BackgroundWorker();
        worker.DoWork += delegate
        {
            Installer installer = new Installer(folder, Log);
            installer.Install();
        };
        worker.RunWorkerCompleted += delegate(object completedSender, RunWorkerCompletedEventArgs completedEvent)
        {
            progressBar.MarqueeAnimationSpeed = 0;
            progressBar.Style = ProgressBarStyle.Continuous;
            progressBar.Value = completedEvent.Error == null ? 100 : 0;
            closeButton.Enabled = true;

            if (completedEvent.Error != null)
            {
                statusLabel.Text = "Setup failed.";
                installButton.Enabled = true;
                browseButton.Enabled = true;
                folderBox.Enabled = true;
                Log("Setup failed: " + completedEvent.Error.Message);
                MessageBox.Show(this, completedEvent.Error.Message, "Setup failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            statusLabel.Text = "Setup complete.";
            Log("Setup complete.");
            MessageBox.Show(this, Program.AppName + " has been installed.", Program.AppName + " Setup", MessageBoxButtons.OK, MessageBoxIcon.Information);
            Close();
        };
        worker.RunWorkerAsync();
    }

    private void Log(string message)
    {
        if (InvokeRequired)
        {
            BeginInvoke(new Action<string>(Log), message);
            return;
        }

        statusLabel.Text = message;
        logBox.AppendText(DateTime.Now.ToString("HH:mm:ss") + "  " + message + Environment.NewLine);
    }
}

public sealed class UninstallForm : Form
{
    private readonly string installRoot;
    private readonly bool finishOnly;
    private readonly Label statusLabel;
    private readonly ProgressBar progressBar;

    public UninstallForm(string installRoot, bool finishOnly)
    {
        this.installRoot = installRoot;
        this.finishOnly = finishOnly;

        Text = Program.AppName + " Uninstall";
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(500, 180);
        Font = new Font("Segoe UI", 10F);

        statusLabel = new Label();
        statusLabel.Text = finishOnly ? "Removing app files..." : "Ready to uninstall.";
        statusLabel.AutoSize = true;
        statusLabel.Location = new Point(24, 25);
        statusLabel.AccessibleName = "Uninstall status";

        progressBar = new ProgressBar();
        progressBar.Location = new Point(27, 68);
        progressBar.Size = new Size(430, 24);
        progressBar.Style = ProgressBarStyle.Marquee;
        progressBar.MarqueeAnimationSpeed = 30;

        Controls.Add(statusLabel);
        Controls.Add(progressBar);

        Shown += UninstallForm_Shown;
    }

    private void UninstallForm_Shown(object sender, EventArgs e)
    {
        if (!finishOnly)
        {
            DialogResult result = MessageBox.Show(this, "Remove " + Program.AppName + " from this computer?", Program.AppName + " Uninstall", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (result != DialogResult.Yes)
            {
                Close();
                return;
            }
        }

        BackgroundWorker worker = new BackgroundWorker();
        worker.DoWork += delegate { Installer.Uninstall(installRoot, finishOnly); };
        worker.RunWorkerCompleted += delegate(object completedSender, RunWorkerCompletedEventArgs completedEvent)
        {
            progressBar.MarqueeAnimationSpeed = 0;
            if (completedEvent.Error != null)
            {
                statusLabel.Text = "Uninstall failed.";
                MessageBox.Show(this, completedEvent.Error.Message, "Uninstall failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            else
            {
                statusLabel.Text = "Uninstall complete.";
                if (!finishOnly)
                {
                    MessageBox.Show(this, Program.AppName + " has been removed.", Program.AppName + " Uninstall", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
            Close();
        };
        worker.RunWorkerAsync();
    }
}

public sealed class Installer
{
    private readonly string installRoot;
    private readonly Action<string> log;

    public static string DefaultInstallRoot
    {
        get
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PastPaperRevisionHub");
        }
    }

    public Installer(string installRoot, Action<string> log)
    {
        this.installRoot = installRoot;
        this.log = log;
    }

    public void Install()
    {
        string toolsDir = Path.Combine(installRoot, "tools");
        string nodeDir = Path.Combine(toolsDir, "node");
        string pythonDir = Path.Combine(toolsDir, "python");
        string nodeExe = Path.Combine(nodeDir, "node.exe");
        string pythonExe = Path.Combine(pythonDir, "python.exe");

        CopyAppFiles();
        InstallNode(nodeDir);
        InstallPython(pythonDir);
        InstallConverter(pythonExe);
        CreateLaunchFiles(nodeExe, pythonExe);
        CreateShortcuts();
        RegisterUninstall();
        WriteSetupState();

        log("Opening the app...");
        Process.Start(Path.Combine(installRoot, "Launch-PastPaperRevisionHub.vbs"));
    }

    private void CopyAppFiles()
    {
        log("Installing app files");
        string tempRoot = Path.Combine(Path.GetTempPath(), "PastPaperRevisionHubPayload-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);

        try
        {
            string zipPath = Path.Combine(tempRoot, "payload.zip");
            File.WriteAllBytes(zipPath, Convert.FromBase64String(Program.PayloadZipBase64));
            ZipFile.ExtractToDirectory(zipPath, tempRoot);

            Directory.CreateDirectory(installRoot);
            Directory.CreateDirectory(Path.Combine(installRoot, "data"));
            Directory.CreateDirectory(Path.Combine(installRoot, "tools"));

            foreach (string file in new[] { "index.html", "styles.css", "app.js", "server.js", "package.json", "requirements.txt", "README.md" })
            {
                File.Copy(Path.Combine(tempRoot, file), Path.Combine(installRoot, file), true);
            }

            File.Copy(Path.Combine(tempRoot, "real-papers.json"), Path.Combine(installRoot, "data", "real-papers.json"), true);
        }
        finally
        {
            TryDeleteDirectory(tempRoot);
        }
    }

    private void InstallNode(string nodeDir)
    {
        string nodeExe = Path.Combine(nodeDir, "node.exe");
        if (File.Exists(nodeExe))
        {
            log("Node runtime already installed");
            return;
        }

        log("Downloading Node runtime");
        string tempZip = Path.Combine(Path.GetTempPath(), "pprh-node.zip");
        string tempExtract = Path.Combine(Path.GetTempPath(), "pprh-node-" + Guid.NewGuid().ToString("N"));
        SafeDeleteFile(tempZip);
        TryDeleteDirectory(tempExtract);

        DownloadFile("https://nodejs.org/dist/v" + Program.NodeVersion + "/node-v" + Program.NodeVersion + "-win-x64.zip", tempZip);

        log("Installing Node runtime");
        ZipFile.ExtractToDirectory(tempZip, tempExtract);
        string expanded = Directory.GetDirectories(tempExtract)[0];
        TryDeleteDirectory(nodeDir);
        Directory.Move(expanded, nodeDir);
        SafeDeleteFile(tempZip);
        TryDeleteDirectory(tempExtract);
    }

    private void InstallPython(string pythonDir)
    {
        string pythonExe = Path.Combine(pythonDir, "python.exe");
        if (File.Exists(pythonExe) && RunProcess(pythonExe, "-m pip --version", pythonDir, true) == 0)
        {
            log("Python runtime already installed");
            return;
        }

        log("Downloading Python runtime");
        string tempZip = Path.Combine(Path.GetTempPath(), "pprh-python-embed.zip");
        string getPip = Path.Combine(Path.GetTempPath(), "pprh-get-pip.py");
        SafeDeleteFile(tempZip);
        SafeDeleteFile(getPip);
        TryDeleteDirectory(pythonDir);
        Directory.CreateDirectory(pythonDir);

        DownloadFile("https://www.python.org/ftp/python/" + Program.PythonVersion + "/python-" + Program.PythonVersion + "-embed-amd64.zip", tempZip);

        log("Installing Python runtime");
        ZipFile.ExtractToDirectory(tempZip, pythonDir);
        EnablePythonSitePackages(pythonDir);

        log("Installing pip");
        DownloadFile("https://bootstrap.pypa.io/get-pip.py", getPip);
        int pipCode = RunProcess(pythonExe, "\"" + getPip + "\" --no-warn-script-location", pythonDir, true);
        if (pipCode != 0)
        {
            throw new Exception("pip bootstrap failed with exit code " + pipCode);
        }

        SafeDeleteFile(tempZip);
        SafeDeleteFile(getPip);
    }

    private void InstallConverter(string pythonExe)
    {
        log("Installing PDF-to-Word converter");
        int pipCode = RunProcess(pythonExe, "-m pip install --upgrade pip", installRoot, true);
        if (pipCode != 0)
        {
            throw new Exception("pip upgrade failed with exit code " + pipCode);
        }

        int requirementsCode = RunProcess(pythonExe, "-m pip install --no-warn-script-location -r \"" + Path.Combine(installRoot, "requirements.txt") + "\"", installRoot, true);
        if (requirementsCode != 0)
        {
            throw new Exception("pdf2docx install failed with exit code " + requirementsCode);
        }
    }

    private void CreateLaunchFiles(string nodeExe, string pythonExe)
    {
        log("Creating app launcher");
        string launchVbs = Path.Combine(installRoot, "Launch-PastPaperRevisionHub.vbs");
        string serverJs = Path.Combine(installRoot, "server.js");

        string script =
            "Set shell = CreateObject(\"WScript.Shell\")\r\n" +
            "Set files = CreateObject(\"Scripting.FileSystemObject\")\r\n" +
            "shell.Environment(\"PROCESS\")(\"PPRH_PYTHON\") = \"" + VbsEscape(pythonExe) + "\"\r\n" +
            "shell.Run Chr(34) & \"" + VbsEscape(nodeExe) + "\" & Chr(34) & \" \" & Chr(34) & \"" + VbsEscape(serverJs) + "\" & Chr(34), 0, False\r\n" +
            "WScript.Sleep 2000\r\n" +
            "appUrl = \"http://127.0.0.1:4173/\"\r\n" +
            "edgePath = shell.ExpandEnvironmentStrings(\"%ProgramFiles(x86)%\") & \"\\Microsoft\\Edge\\Application\\msedge.exe\"\r\n" +
            "chromePath = shell.ExpandEnvironmentStrings(\"%ProgramFiles%\") & \"\\Google\\Chrome\\Application\\chrome.exe\"\r\n" +
            "If files.FileExists(edgePath) Then\r\n" +
            "  shell.Run Chr(34) & edgePath & Chr(34) & \" --start-fullscreen --app=\" & appUrl, 1, False\r\n" +
            "ElseIf files.FileExists(chromePath) Then\r\n" +
            "  shell.Run Chr(34) & chromePath & Chr(34) & \" --start-fullscreen --app=\" & appUrl, 1, False\r\n" +
            "Else\r\n" +
            "  shell.Run \"cmd /c start \"\"\"\" /max \"\"\" & appUrl & \"\"\"\", 0, False\r\n" +
            "End If\r\n";

        File.WriteAllText(launchVbs, script, Encoding.ASCII);
    }

    private void CreateShortcuts()
    {
        log("Creating shortcuts");
        string launchVbs = Path.Combine(installRoot, "Launch-PastPaperRevisionHub.vbs");
        string startMenuShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Microsoft", "Windows", "Start Menu", "Programs", "Past Paper Revision Hub.lnk");
        string desktopShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Past Paper Revision Hub.lnk");

        Directory.CreateDirectory(Path.GetDirectoryName(startMenuShortcut));
        CreateShortcut(startMenuShortcut, "wscript.exe", "\"" + launchVbs + "\"", installRoot, Program.AppName);
        CreateShortcut(desktopShortcut, "wscript.exe", "\"" + launchVbs + "\"", installRoot, Program.AppName);
    }

    private void RegisterUninstall()
    {
        log("Registering Windows uninstall entry");
        string uninstallExe = Path.Combine(installRoot, "PastPaperRevisionHubUninstall.exe");
        File.Copy(Assembly.GetExecutingAssembly().Location, uninstallExe, true);
        string command = "\"" + uninstallExe + "\" --uninstall";

        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\PastPaperRevisionHub"))
        {
            key.SetValue("DisplayName", Program.AppName, RegistryValueKind.String);
            key.SetValue("DisplayVersion", "1.0.0", RegistryValueKind.String);
            key.SetValue("Publisher", "Past Paper Revision Hub", RegistryValueKind.String);
            key.SetValue("InstallLocation", installRoot, RegistryValueKind.String);
            key.SetValue("UninstallString", command, RegistryValueKind.String);
            key.SetValue("QuietUninstallString", command, RegistryValueKind.String);
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            key.SetValue("EstimatedSize", GetDirectorySizeKb(installRoot), RegistryValueKind.DWord);
        }
    }

    private void WriteSetupState()
    {
        string json = "{\r\n  \"completedAt\": \"" + DateTime.UtcNow.ToString("o") + "\",\r\n  \"tools\": [\"node\", \"python\", \"pdf2docx\"]\r\n}\r\n";
        File.WriteAllText(Path.Combine(installRoot, ".setup-complete.json"), json, Encoding.UTF8);
    }

    public static void Uninstall(string installRoot, bool finishOnly)
    {
        if (!finishOnly)
        {
            string helper = Path.Combine(Path.GetTempPath(), "PastPaperRevisionHubUninstall-" + Guid.NewGuid().ToString("N") + ".exe");
            File.Copy(Assembly.GetExecutingAssembly().Location, helper, true);
            Process.Start(new ProcessStartInfo(helper, "--finish-uninstall \"" + installRoot + "\"") { UseShellExecute = true });
            return;
        }

        Thread.Sleep(1200);
        SafeDeleteFile(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Past Paper Revision Hub.lnk"));
        SafeDeleteFile(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Microsoft", "Windows", "Start Menu", "Programs", "Past Paper Revision Hub.lnk"));
        Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\PastPaperRevisionHub", false);
        TryDeleteDirectory(installRoot);
    }

    private static void EnablePythonSitePackages(string pythonDir)
    {
        foreach (string pthFile in Directory.GetFiles(pythonDir, "*._pth"))
        {
            string text = File.ReadAllText(pthFile);
            text = text.Replace("#import site", "import site");
            File.WriteAllText(pthFile, text, Encoding.ASCII);
        }
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string arguments, string workingDirectory, string description)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(shellType);
        object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
        Type shortcutType = shortcut.GetType();
        shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
        shortcutType.InvokeMember("Arguments", BindingFlags.SetProperty, null, shortcut, new object[] { arguments });
        shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDirectory });
        shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { description });
        shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
    }

    private static void DownloadFile(string url, string destination)
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        using (WebClient client = new WebClient())
        {
            client.DownloadFile(url, destination);
        }
    }

    private static int RunProcess(string fileName, string arguments, string workingDirectory, bool hidden)
    {
        ProcessStartInfo startInfo = new ProcessStartInfo(fileName, arguments);
        startInfo.WorkingDirectory = workingDirectory ?? Environment.CurrentDirectory;
        startInfo.UseShellExecute = false;
        startInfo.CreateNoWindow = hidden;
        startInfo.RedirectStandardOutput = true;
        startInfo.RedirectStandardError = true;

        using (Process process = Process.Start(startInfo))
        {
            process.WaitForExit();
            return process.ExitCode;
        }
    }

    private static int GetDirectorySizeKb(string path)
    {
        long total = 0;
        if (Directory.Exists(path))
        {
            foreach (string file in Directory.GetFiles(path, "*", SearchOption.AllDirectories))
            {
                try { total += new FileInfo(file).Length; } catch { }
            }
        }

        return (int)Math.Max(1, total / 1024);
    }

    private static string VbsEscape(string value)
    {
        return value.Replace("\"", "\"\"");
    }

    private static void SafeDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch { }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
            }
        }
        catch { }
    }
}
"@

$source | Set-Content -LiteralPath $installerSource -Encoding UTF8
Add-Type -TypeDefinition $source -ReferencedAssemblies "System.IO.Compression.FileSystem.dll","System.Windows.Forms.dll","System.Drawing.dll" -OutputAssembly $buildSetupExe -OutputType WindowsApplication

Copy-Item -LiteralPath $buildSetupExe -Destination $latestExe -Force
Remove-Item -LiteralPath $oldRootExe -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $setupExe -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $dist "PastPaperRevisionHubSetup.sed") -Force -ErrorAction SilentlyContinue

Write-Host "Built GUI installer:"
Write-Host $latestExe
