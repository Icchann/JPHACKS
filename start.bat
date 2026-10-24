@echo off
chcp 65001 >nul
title 山網（Sanmou）システム起動
echo ====================================================
echo   🌲 山網（Sanmou）山林監視システム を起動します
echo ====================================================
echo.
echo ブラウザが自動的に開くまで数秒お待ちください...
echo 終了するときは、このウィンドウを閉じるか [Ctrl + C] を押してください。
echo.

python start.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [お知らせ] 起動が終了しました。
    pause
)
