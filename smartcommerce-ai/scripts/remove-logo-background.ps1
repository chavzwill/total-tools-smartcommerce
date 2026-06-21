param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class LogoBackgroundRemover
{
    public static string Run(string inputPath, string outputPath)
    {
        using (var sourceFile = new Bitmap(inputPath))
        using (var image = new Bitmap(sourceFile.Width, sourceFile.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(image)) graphics.DrawImageUnscaled(sourceFile, 0, 0);
            var rect = new Rectangle(0, 0, image.Width, image.Height);
            var data = image.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            var bytes = new byte[Math.Abs(data.Stride) * image.Height];
            Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
            var visited = new bool[image.Width * image.Height];
            var queue = new Queue<int>();

            Action<int, int> enqueue = (x, y) => {
                int index = y * image.Width + x;
                int offset = y * data.Stride + x * 4;
                if (visited[index]) return;
                byte b = bytes[offset], g = bytes[offset + 1], r = bytes[offset + 2];
                byte min = Math.Min(r, Math.Min(g, b));
                byte max = Math.Max(r, Math.Max(g, b));
                if (min >= 235 && max - min <= 18) { visited[index] = true; queue.Enqueue(index); }
            };

            for (int x = 0; x < image.Width; x++) { enqueue(x, 0); enqueue(x, image.Height - 1); }
            for (int y = 0; y < image.Height; y++) { enqueue(0, y); enqueue(image.Width - 1, y); }

            while (queue.Count > 0)
            {
                int index = queue.Dequeue();
                int x = index % image.Width, y = index / image.Width;
                bytes[y * data.Stride + x * 4 + 3] = 0;
                if (x > 0) enqueue(x - 1, y);
                if (x + 1 < image.Width) enqueue(x + 1, y);
                if (y > 0) enqueue(x, y - 1);
                if (y + 1 < image.Height) enqueue(x, y + 1);
            }

            Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
            image.UnlockBits(data);
            image.Save(outputPath, ImageFormat.Png);
            return image.Width + "x" + image.Height;
        }
    }
}
"@ -ReferencedAssemblies System.Drawing

[LogoBackgroundRemover]::Run($InputPath, $OutputPath)
