@echo off
chcp 65001 >nul
title 山網 実機シリアル受信テスト
echo ====================================================
echo   🌲 山網 実機シリアル受信・実証実験モード
echo ====================================================
echo.
echo 集約機をPCのUSBに接続した状態で実行してください。
echo.
set /p COM_PORT="集約機のCOMポート番号を入力してください (例: COM3) [未入力でCOM3]: "
if "%COM_PORT%"=="" set COM_PORT=COM3
echo.
echo %COM_PORT% でUSBシリアル受信を開始し、ダッシュボードを起動します...
echo.

python scripts\run_test_environment.py --port %COM_PORT%

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [お知らせ] プロセスが終了しました。
    pause
)
