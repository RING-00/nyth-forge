export const miaw = `
<!DOCTYPE html>
<html>
<head>
    <title>waguri my beloved</title>
    <style>
        body {
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            text-align: center;
            padding: 30px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
        }
        img {
            max-width: 300px;
            height: auto;
            border-radius: 15px;
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            -webkit-user-drag: none;
            -khtml-user-drag: none;
            -moz-user-drag: none;
            -o-user-drag: none;
            user-drag: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <img src="/waguri.gif" alt="Waguri" onerror="this.style.display='none'; console.log('Image failed to load');" />
    </div>
</body>
</html>`;
