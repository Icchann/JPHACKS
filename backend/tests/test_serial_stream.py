from app.device.stream import SerialLineBuffer


def test_split_record_is_buffered_until_crlf() -> None:
    buffer = SerialLineBuffer()

    assert buffer.feed(b"S0,T1,247,0,672755,-976") == []
    frames = buffer.feed(b",0,96,-1,-1\r\n")

    assert len(frames) == 1
    assert frames[0].has_crlf is True
    assert frames[0].line == b"S0,T1,247,0,672755,-976,0,96,-1,-1"
    assert buffer.pending_bytes == 0


def test_multiple_records_are_extracted_from_one_chunk() -> None:
    buffer = SerialLineBuffer()

    frames = buffer.feed(
        b"S0,T1,249,0,675760,-976,0,80,-1,-1\r\nS0,T1,250,0,677260,-976,0,96,-1,-1\r\n"
    )

    assert [frame.line for frame in frames] == [
        b"S0,T1,249,0,675760,-976,0,80,-1,-1",
        b"S0,T1,250,0,677260,-976,0,96,-1,-1",
    ]


def test_bare_lf_is_marked_as_invalid_terminator() -> None:
    frames = SerialLineBuffer().feed(b"S0,T1,1,0,10,0,0,1000,-1,-1\n")

    assert len(frames) == 1
    assert frames[0].has_crlf is False


def test_unterminated_noise_is_bounded() -> None:
    buffer = SerialLineBuffer(max_buffer_bytes=8)

    assert buffer.feed(b"123456789") == []
    assert buffer.pending_bytes == 0
    assert buffer.dropped_bytes == 9
