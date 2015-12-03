(function (window) {
    "use strict";

    var MP2Audio = window.MP2Audio = function (url, opts) {
        opts = opts || {};

        var ctx = null;
        var dest = null;

        var ws_url = url;
        var ws = null;

        var inQuery = new Array();

        var decoded_frame_size = 1152;
        var pcm_buffer_size = 5;
        var pcm_buffer_pos = 0;
        var pcm_buffer_length = decoded_frame_size * pcm_buffer_size;
        var pcm_buffer_duration = pcm_buffer_length / 44100;
        var pcm_buffer_l = new Float32Array(pcm_buffer_length);
        var pcm_buffer_r = new Float32Array(pcm_buffer_length);

        var decoding = false;
        var bufStartTime = 0;

        var filter = null;
        

        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            ctx = new AudioContext();
            dest = ctx.destination;
        }
        catch (e) {
            console.log(e);
            console.log('Web Audio API is not supported in this browser');
        }

        if (opts.filter && opts.filter.t && opts.filter.f && opts.filter.q) {
            filter = ctx.createBiquadFilter();
            filter.connect(ctx.destination);
            dest = filter;

            filter.type = opts.filter.t;
            filter.Q.value = opts.filter.q;
            filter.frequency.value = opts.filter.f;
            if (opts.filter.g) filter.gain.value = opts.filter.g;
        }

        kjmp_initialize();
        ws_reconnect();


        function ws_reconnect() {
            console.log("connecting...");

            ws = new WebSocket(ws_url);
            ws.binaryType = "arraybuffer";

            ws.onopen = function () {
                console.log("connected");

                // restart decoder
                kjmp_init();
                decoding = false;
                pcm_buffer_pos = 0;
            };

            ws.onmessage = function (m) {
                var src = new Uint8Array(m.data);
                decodeNextFrame(src);
            };

            ws.onclose = function (ev) {
                setTimeout(function () {
                    ws_reconnect();
                }, 1000);
            };
        }

        function decodeNextFrame(buf) {
            if (decoding) {
                inQuery.push(buf);
                return;
            }

            decoding = true;

            /////// processing ///////

            var l = new Array();
            var r = new Array();

            //var start = new Date();

            var ok = kjmp2_decode_frame(buf, l, r);

            //var end = new Date();
            //console.log((end.getTime()-start.getTime()) + ' ìñ');

            if (ok) {
                //console.log(l.length);
                if (l.length == decoded_frame_size) {
                    for (var i = 0; i < l.length; i++) {
                        pcm_buffer_l[pcm_buffer_pos] = l[i];
                        pcm_buffer_r[pcm_buffer_pos] = r[i];
                        pcm_buffer_pos++;

                        if (pcm_buffer_pos == pcm_buffer_length) {
                            pcm_buffer_ready();
                            pcm_buffer_pos = 0;
                        }
                    }
                }
            }
            //////////////////////////

            decoding = false;

            if (inQuery.length) {
                decodeNextFrame(inQuery.shift());
            }
        }

        function pcm_buffer_ready() {

            var arrbuf = ctx.createBuffer(2, pcm_buffer_length, 44100 - 100);
            arrbuf.getChannelData(0).set(pcm_buffer_l);
            arrbuf.getChannelData(1).set(pcm_buffer_r);

            var source = ctx.createBufferSource();
            source.buffer = arrbuf;
            source.connect(dest);

            var ct = ctx.currentTime;

            if (bufStartTime < ct) {
                bufStartTime = ct;
            }

            source.start(bufStartTime);

            bufStartTime += arrbuf.duration;
        }

        ///// KJMP /////
        var kjmp_mp2 = {id: null, V: [[], []], Voffs: null};
        var kjmp_N;
        var kjmp_allocation;
        var kjmp_scfsi;
        var kjmp_scalefactor;
        var kjmp_sample;
        var kjmp_U;

        const STEREO = 0;
        const JOINT_STEREO = 1;
        const DUAL_CHANNEL = 2;
        const MONO = 3;

        const kjmp_scf_value = [
            0x02000000, 0x01965FEA, 0x01428A30, 0x01000000,
            0x00CB2FF5, 0x00A14518, 0x00800000, 0x006597FB,
            0x0050A28C, 0x00400000, 0x0032CBFD, 0x00285146,
            0x00200000, 0x001965FF, 0x001428A3, 0x00100000,
            0x000CB2FF, 0x000A1451, 0x00080000, 0x00065980,
            0x00050A29, 0x00040000, 0x00032CC0, 0x00028514,
            0x00020000, 0x00019660, 0x0001428A, 0x00010000,
            0x0000CB30, 0x0000A145, 0x00008000, 0x00006598,
            0x000050A3, 0x00004000, 0x000032CC, 0x00002851,
            0x00002000, 0x00001966, 0x00001429, 0x00001000,
            0x00000CB3, 0x00000A14, 0x00000800, 0x00000659,
            0x0000050A, 0x00000400, 0x0000032D, 0x00000285,
            0x00000200, 0x00000196, 0x00000143, 0x00000100,
            0x000000CB, 0x000000A1, 0x00000080, 0x00000066,
            0x00000051, 0x00000040, 0x00000033, 0x00000028,
            0x00000020, 0x00000019, 0x00000014, 0];

        const kjmp_sample_rates = [44100, 48000, 32000, 0];
        const kjmp_bitrates = [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384];

        const kjmp_D = [
            0x00000, 0x00000, 0x00000, 0x00000, 0x00000, 0x00000, 0x00000, -0x00001,
            -0x00001, -0x00001, -0x00001, -0x00002, -0x00002, -0x00003, -0x00003, -0x00004,
            -0x00004, -0x00005, -0x00006, -0x00006, -0x00007, -0x00008, -0x00009, -0x0000A,
            -0x0000C, -0x0000D, -0x0000F, -0x00010, -0x00012, -0x00014, -0x00017, -0x00019,
            -0x0001C, -0x0001E, -0x00022, -0x00025, -0x00028, -0x0002C, -0x00030, -0x00034,
            -0x00039, -0x0003E, -0x00043, -0x00048, -0x0004E, -0x00054, -0x0005A, -0x00060,
            -0x00067, -0x0006E, -0x00074, -0x0007C, -0x00083, -0x0008A, -0x00092, -0x00099,
            -0x000A0, -0x000A8, -0x000AF, -0x000B6, -0x000BD, -0x000C3, -0x000C9, -0x000CF,
            0x000D5, 0x000DA, 0x000DE, 0x000E1, 0x000E3, 0x000E4, 0x000E4, 0x000E3,
            0x000E0, 0x000DD, 0x000D7, 0x000D0, 0x000C8, 0x000BD, 0x000B1, 0x000A3,
            0x00092, 0x0007F, 0x0006A, 0x00053, 0x00039, 0x0001D, -0x00001, -0x00023,
            -0x00047, -0x0006E, -0x00098, -0x000C4, -0x000F3, -0x00125, -0x0015A, -0x00190,
            -0x001CA, -0x00206, -0x00244, -0x00284, -0x002C6, -0x0030A, -0x0034F, -0x00396,
            -0x003DE, -0x00427, -0x00470, -0x004B9, -0x00502, -0x0054B, -0x00593, -0x005D9,
            -0x0061E, -0x00661, -0x006A1, -0x006DE, -0x00718, -0x0074D, -0x0077E, -0x007A9,
            -0x007D0, -0x007EF, -0x00808, -0x0081A, -0x00824, -0x00826, -0x0081F, -0x0080E,
            0x007F5, 0x007D0, 0x007A0, 0x00765, 0x0071E, 0x006CB, 0x0066C, 0x005FF,
            0x00586, 0x00500, 0x0046B, 0x003CA, 0x0031A, 0x0025D, 0x00192, 0x000B9,
            -0x0002C, -0x0011F, -0x00220, -0x0032D, -0x00446, -0x0056B, -0x0069B, -0x007D5,
            -0x00919, -0x00A66, -0x00BBB, -0x00D16, -0x00E78, -0x00FDE, -0x01148, -0x012B3,
            -0x01420, -0x0158C, -0x016F6, -0x0185C, -0x019BC, -0x01B16, -0x01C66, -0x01DAC,
            -0x01EE5, -0x02010, -0x0212A, -0x02232, -0x02325, -0x02402, -0x024C7, -0x02570,
            -0x025FE, -0x0266D, -0x026BB, -0x026E6, -0x026ED, -0x026CE, -0x02686, -0x02615,
            -0x02577, -0x024AC, -0x023B2, -0x02287, -0x0212B, -0x01F9B, -0x01DD7, -0x01BDD,
            0x019AE, 0x01747, 0x014A8, 0x011D1, 0x00EC0, 0x00B77, 0x007F5, 0x0043A,
            0x00046, -0x003E5, -0x00849, -0x00CE3, -0x011B4, -0x016B9, -0x01BF1, -0x0215B,
            -0x026F6, -0x02CBE, -0x032B3, -0x038D3, -0x03F1A, -0x04586, -0x04C15, -0x052C4,
            -0x05990, -0x06075, -0x06771, -0x06E80, -0x0759F, -0x07CCA, -0x083FE, -0x08B37,
            -0x09270, -0x099A7, -0x0A0D7, -0x0A7FD, -0x0AF14, -0x0B618, -0x0BD05, -0x0C3D8,
            -0x0CA8C, -0x0D11D, -0x0D789, -0x0DDC9, -0x0E3DC, -0x0E9BD, -0x0EF68, -0x0F4DB,
            -0x0FA12, -0x0FF09, -0x103BD, -0x1082C, -0x10C53, -0x1102E, -0x113BD, -0x116FB,
            -0x119E8, -0x11C82, -0x11EC6, -0x120B3, -0x12248, -0x12385, -0x12467, -0x124EF,
            0x1251E, 0x124F0, 0x12468, 0x12386, 0x12249, 0x120B4, 0x11EC7, 0x11C83,
            0x119E9, 0x116FC, 0x113BE, 0x1102F, 0x10C54, 0x1082D, 0x103BE, 0x0FF0A,
            0x0FA13, 0x0F4DC, 0x0EF69, 0x0E9BE, 0x0E3DD, 0x0DDCA, 0x0D78A, 0x0D11E,
            0x0CA8D, 0x0C3D9, 0x0BD06, 0x0B619, 0x0AF15, 0x0A7FE, 0x0A0D8, 0x099A8,
            0x09271, 0x08B38, 0x083FF, 0x07CCB, 0x075A0, 0x06E81, 0x06772, 0x06076,
            0x05991, 0x052C5, 0x04C16, 0x04587, 0x03F1B, 0x038D4, 0x032B4, 0x02CBF,
            0x026F7, 0x0215C, 0x01BF2, 0x016BA, 0x011B5, 0x00CE4, 0x0084A, 0x003E6,
            -0x00045, -0x00439, -0x007F4, -0x00B76, -0x00EBF, -0x011D0, -0x014A7, -0x01746,
            0x019AE, 0x01BDE, 0x01DD8, 0x01F9C, 0x0212C, 0x02288, 0x023B3, 0x024AD,
            0x02578, 0x02616, 0x02687, 0x026CF, 0x026EE, 0x026E7, 0x026BC, 0x0266E,
            0x025FF, 0x02571, 0x024C8, 0x02403, 0x02326, 0x02233, 0x0212B, 0x02011,
            0x01EE6, 0x01DAD, 0x01C67, 0x01B17, 0x019BD, 0x0185D, 0x016F7, 0x0158D,
            0x01421, 0x012B4, 0x01149, 0x00FDF, 0x00E79, 0x00D17, 0x00BBC, 0x00A67,
            0x0091A, 0x007D6, 0x0069C, 0x0056C, 0x00447, 0x0032E, 0x00221, 0x00120,
            0x0002D, -0x000B8, -0x00191, -0x0025C, -0x00319, -0x003C9, -0x0046A, -0x004FF,
            -0x00585, -0x005FE, -0x0066B, -0x006CA, -0x0071D, -0x00764, -0x0079F, -0x007CF,
            0x007F5, 0x0080F, 0x00820, 0x00827, 0x00825, 0x0081B, 0x00809, 0x007F0,
            0x007D1, 0x007AA, 0x0077F, 0x0074E, 0x00719, 0x006DF, 0x006A2, 0x00662,
            0x0061F, 0x005DA, 0x00594, 0x0054C, 0x00503, 0x004BA, 0x00471, 0x00428,
            0x003DF, 0x00397, 0x00350, 0x0030B, 0x002C7, 0x00285, 0x00245, 0x00207,
            0x001CB, 0x00191, 0x0015B, 0x00126, 0x000F4, 0x000C5, 0x00099, 0x0006F,
            0x00048, 0x00024, 0x00002, -0x0001C, -0x00038, -0x00052, -0x00069, -0x0007E,
            -0x00091, -0x000A2, -0x000B0, -0x000BC, -0x000C7, -0x000CF, -0x000D6, -0x000DC,
            -0x000DF, -0x000E2, -0x000E3, -0x000E3, -0x000E2, -0x000E0, -0x000DD, -0x000D9,
            0x000D5, 0x000D0, 0x000CA, 0x000C4, 0x000BE, 0x000B7, 0x000B0, 0x000A9,
            0x000A1, 0x0009A, 0x00093, 0x0008B, 0x00084, 0x0007D, 0x00075, 0x0006F,
            0x00068, 0x00061, 0x0005B, 0x00055, 0x0004F, 0x00049, 0x00044, 0x0003F,
            0x0003A, 0x00035, 0x00031, 0x0002D, 0x00029, 0x00026, 0x00023, 0x0001F,
            0x0001D, 0x0001A, 0x00018, 0x00015, 0x00013, 0x00011, 0x00010, 0x0000E,
            0x0000D, 0x0000B, 0x0000A, 0x00009, 0x00008, 0x00007, 0x00007, 0x00006,
            0x00005, 0x00005, 0x00004, 0x00004, 0x00003, 0x00003, 0x00002, 0x00002,
            0x00002, 0x00002, 0x00001, 0x00001, 0x00001, 0x00001, 0x00001, 0x00001];

        const kjmp_quant_lut_step1 = [
            [0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2],
            [0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2]];

        const QUANT_TAB_A = (27 | 64);   // Table 3-B.2a: high-rate, sblimit = 27
        const QUANT_TAB_B = (30 | 64);   // Table 3-B.2b: high-rate, sblimit = 30
        const QUANT_TAB_C = 8;         // Table 3-B.2c:  low-rate, sblimit =  8
        const QUANT_TAB_D = 12;        // Table 3-B.2d:  low-rate, sblimit = 12

        const kjmp_quant_lut_step2 = [
            [QUANT_TAB_C, QUANT_TAB_C, QUANT_TAB_D],
            [QUANT_TAB_A, QUANT_TAB_A, QUANT_TAB_A],
            [QUANT_TAB_B, QUANT_TAB_A, QUANT_TAB_B]];

        const kjmp_quant_lut_step3 = [
            [0x44, 0x44,
                0x34, 0x34, 0x34, 0x34, 0x34, 0x34, 0x34, 0x34, 0x34, 0x34
            ],
            [0x43, 0x43, 0x43,
                0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42,
                0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31,
                0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20]];

        const kjmp_quant_lut_step4 = [
            [0, 1, 2, 17],
            [0, 1, 2, 3, 4, 5, 6, 17],
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17],
            [0, 1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
            [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17]];


        function quantizer_spec(nlevels, grouping, cw_bits, Smul, Sdiv) {
            return {
                nlevels: nlevels,
                grouping: grouping,
                cw_bits: cw_bits,
                Smul: Smul,
                Sdiv: Sdiv
            };
        }

        const kjmp_quantizer_table = [
            quantizer_spec(3, 1, 5, 0x7FFF, 0xFFFF),
            quantizer_spec(5, 1, 7, 0x3FFF, 0x0002),
            quantizer_spec(7, 0, 3, 0x2AAA, 0x0003),
            quantizer_spec(9, 1, 10, 0x1FFF, 0x0002),
            quantizer_spec(15, 0, 4, 0x1249, 0xFFFF),
            quantizer_spec(31, 0, 5, 0x0888, 0x0003),
            quantizer_spec(63, 0, 6, 0x0421, 0xFFFF),
            quantizer_spec(127, 0, 7, 0x0208, 0x0009),
            quantizer_spec(255, 0, 8, 0x0102, 0x007F),
            quantizer_spec(511, 0, 9, 0x0080, 0x0002),
            quantizer_spec(1023, 0, 10, 0x0040, 0x0009),
            quantizer_spec(2047, 0, 11, 0x0020, 0x0021),
            quantizer_spec(4095, 0, 12, 0x0010, 0x0089),
            quantizer_spec(8191, 0, 13, 0x0008, 0x0249),
            quantizer_spec(16383, 0, 14, 0x0004, 0x0AAB),
            quantizer_spec(32767, 0, 15, 0x0002, 0x3FFF),
            quantizer_spec(65535, 0, 16, 0x0001, 0xFFFF)];

        var bit_reader = new BitReader();

        function kjmp_initialize() {
            kjmp_N = [];
            kjmp_allocation = [[], []];
            kjmp_scfsi = [[], []];
            kjmp_scalefactor = [[], []];
            kjmp_sample = [[], []];
            kjmp_U = [];

            for (var i = 0; i < 64; i++) {
                kjmp_N[i] = new Array(32);
                for (var j = 0; j < 32; j++)
                    kjmp_N[i][j] = Math.floor(256.0 * Math.cos(((16 + i) * ((j << 1) + 1)) * 0.0490873852123405));
            }

            for (var j = 0; j < 2; j++)
                for (var i = 0; i < 32; i++)
                    kjmp_scalefactor[j][i] = [[], [], []];

            for (var j = 0; j < 2; j++)
                for (var i = 0; i < 32; i++)
                    kjmp_sample[j][i] = [[], [], []];
        }

        function kjmp_init() {
            for (var i = 0; i < 2; ++i)
                for (var j = 1023; j >= 0; --j)
                    kjmp_mp2.V[i][j] = 0;

            kjmp_mp2.Voffs = 0;
        }

        function kjmp_read_allocation(sb, b2_table) {
            var table_idx = kjmp_quant_lut_step3[b2_table][sb];
            table_idx = kjmp_quant_lut_step4[table_idx & 15][bit_reader.getBits(table_idx >> 4)];
            return table_idx ? (kjmp_quantizer_table[table_idx - 1]) : 0;
        }

        function kjmp_read_samples(q, scalefactor, sample) {
            var idx, adj;
            var val;
            if (!q) {
                sample[0] = sample[1] = sample[2] = 0;
                return false;
            }
            scalefactor = kjmp_scf_value[scalefactor];
            adj = q.nlevels;

            if (q.grouping) {
                val = bit_reader.getBits(q.cw_bits);
                sample[0] = val % adj;
                val = Math.floor(val / adj);
                sample[1] = val % adj;
                sample[2] = Math.floor(val / adj);
            }
            else {
                for (idx = 0; idx < 3; ++idx)
                    sample[idx] = bit_reader.getBits(q.cw_bits);
            }

            adj = ((adj + 1) >> 1) - 1;
            for (idx = 0; idx < 3; ++idx) {
                val = adj - sample[idx];
                val = (val * q.Smul) + Math.floor(val / q.Sdiv);
                sample[idx] = ( val * (scalefactor >> 12) + ((val * (scalefactor & 4095) + 2048) >> 12)) >> 12;
            }
        }


        function kjmp2_decode_frame(frm, out_l, out_r) {
            bit_reader.restart(frm);

            var sb, ch, gr, part, idx, nch, i, j, sum;

            // check for valid header: syncword OK, MPEG-Audio Layer 2
            if ((frm[0] !== 0xFF) || ((frm[1] & 0xFE) !== 0xFC)) {
                return 0;
            }

            // set up the bitstream reader
            bit_reader.advance(16);
            /*
             kjmp_frame = frm;
             kjmp_bit_window = frm[2] << 16;
             kjmp_bits_in_window = 8;
             kjmp_frame_pos = 3;
             */

            // read the rest of the header

            var bit_rate_index_minus1 = bit_reader.getBits(4) - 1;

            if (bit_rate_index_minus1 > 13) {
                return 0;  // invalid bit rate or 'free format'
            }

            var sampling_frequency = bit_reader.getBits(2);

            if (sampling_frequency === 3) {
                return 0;
            }

            var padding_bit = bit_reader.getBits(1);
            bit_reader.advance(1);  // discard private_bit

            var mode = bit_reader.getBits(2);

            // parse the mode_extension, set up the stereo bound
            var bound;

            if (mode === JOINT_STEREO) {
                bound = (bit_reader.getBits(2) + 1) << 2;
            }
            else {
                bit_reader.advance(2);
                bound = (mode === MONO) ? 0 : 32;
            }

            // discard the last 4 bits of the header and the CRC value, if present
            bit_reader.advance(4);

            if ((frm[1] & 1) == 0) bit_reader.advance(16);

            // compute the frame size
            var frame_size = Math.floor(144000 * kjmp_bitrates[bit_rate_index_minus1] / kjmp_sample_rates[sampling_frequency]) + padding_bit;

            // prepare the quantizer table lookups
            var table_idx = (mode === MONO) ? 0 : 1;
            table_idx = kjmp_quant_lut_step1[table_idx][bit_rate_index_minus1];
            table_idx = kjmp_quant_lut_step2[table_idx][sampling_frequency];
            var sblimit = table_idx & 63;
            table_idx >>= 6;
            if (bound > sblimit) {
                bound = sblimit;
            }

            // read the allocation information
            for (sb = 0; sb < bound; ++sb) {
                for (ch = 0; ch < 2; ++ch) {
                    kjmp_allocation[ch][sb] = kjmp_read_allocation(sb, table_idx);
                }
            }

            for (sb = bound; sb < sblimit; ++sb) {
                kjmp_allocation[0][sb] = kjmp_allocation[1][sb] = kjmp_read_allocation(sb, table_idx);
            }

            // read scale factor selector information
            nch = (mode === MONO) ? 1 : 2;
            for (sb = 0; sb < sblimit; ++sb) {
                for (ch = 0; ch < nch; ++ch) {
                    if (kjmp_allocation[ch][sb]) {
                        kjmp_scfsi[ch][sb] = bit_reader.getBits(2);
                    }
                }

                if (mode === MONO) {
                    kjmp_scfsi[1][sb] = kjmp_scfsi[0][sb];
                }
            }

            // read scale factors
            for (sb = 0; sb < sblimit; ++sb) {
                for (ch = 0; ch < nch; ++ch)
                    if (kjmp_allocation[ch][sb]) {
                        switch (kjmp_scfsi[ch][sb]) {
                            case 0:
                                kjmp_scalefactor[ch][sb][0] = bit_reader.getBits(6);
                                kjmp_scalefactor[ch][sb][1] = bit_reader.getBits(6);
                                kjmp_scalefactor[ch][sb][2] = bit_reader.getBits(6);
                                break;
                            case 1:
                                kjmp_scalefactor[ch][sb][0] =
                                    kjmp_scalefactor[ch][sb][1] = bit_reader.getBits(6);
                                kjmp_scalefactor[ch][sb][2] = bit_reader.getBits(6);
                                break;
                            case 2:
                                kjmp_scalefactor[ch][sb][0] =
                                    kjmp_scalefactor[ch][sb][1] =
                                        kjmp_scalefactor[ch][sb][2] = bit_reader.getBits(6);
                                break;
                            case 3:
                                kjmp_scalefactor[ch][sb][0] = bit_reader.getBits(6);
                                kjmp_scalefactor[ch][sb][1] =
                                    kjmp_scalefactor[ch][sb][2] = bit_reader.getBits(6);
                                break;
                        }
                    }

                if (mode == MONO) {
                    for (part = 0; part < 3; ++part) {
                        kjmp_scalefactor[1][sb][part] = kjmp_scalefactor[0][sb][part];
                    }
                }
            }

            // coefficient input and reconstruction
            for (part = 0; part < 3; ++part) {
                for (gr = 0; gr < 4; ++gr) {
                    // read the samples
                    for (sb = 0; sb < bound; ++sb) {
                        for (ch = 0; ch < 2; ++ch) {
                            kjmp_read_samples(kjmp_allocation[ch][sb], kjmp_scalefactor[ch][sb][part], kjmp_sample[ch][sb]);
                        }
                    }

                    for (sb = bound; sb < sblimit; ++sb) {
                        kjmp_read_samples(kjmp_allocation[0][sb], kjmp_scalefactor[0][sb][part], kjmp_sample[0][sb]);

                        for (idx = 0; idx < 3; ++idx) {
                            kjmp_sample[1][sb][idx] = kjmp_sample[0][sb][idx];
                        }
                    }

                    for (ch = 0; ch < 2; ++ch) {
                        for (sb = sblimit; sb < 32; ++sb) {
                            for (idx = 0; idx < 3; ++idx) {
                                kjmp_sample[ch][sb][idx] = 0;
                            }
                        }
                    }

                    // synthesis loop
                    for (idx = 0; idx < 3; ++idx) {
                        // shifting step
                        kjmp_mp2.Voffs = table_idx = (kjmp_mp2.Voffs - 64) & 1023;

                        for (ch = 0; ch < 2; ++ch) {
                            // matrixing
                            for (i = 0; i < 64; ++i) {
                                sum = 0;
                                for (j = 0; j < 32; ++j)
                                    sum += kjmp_N[i][j] * kjmp_sample[ch][j][idx];  // 8b*15b=23b
                                // intermediate value is 28 bit (23 + 5), clamp to 14b
                                kjmp_mp2.V[ch][table_idx + i] = (sum + 8192) >> 14;
                            }

                            // construction of U
                            for (i = 0; i < 8; ++i) {
                                var i6 = i << 6;
                                var i7 = i6 << 1;

                                for (j = 0; j < 32; ++j) {
                                    kjmp_U[(i6) + j] = kjmp_mp2.V[ch][(table_idx + (i7) + j     ) & 1023];
                                    kjmp_U[(i6) + j + 32] = kjmp_mp2.V[ch][(table_idx + (i7) + j + 96) & 1023];
                                }
                            }

                            // apply window
                            for (i = 0; i < 512; ++i) {
                                kjmp_U[i] = (kjmp_U[i] * kjmp_D[i] + 32) >> 6;
                            }

                            // output samples
                            for (j = 0; j < 32; ++j) {
                                sum = 0;
                                for (i = 0; i < 16; ++i) {
                                    sum -= kjmp_U[(i << 5) + j];
                                }

                                sum = (sum + 8) >> 4;
                                if (sum < -32768) {
                                    sum = -32768
                                }
                                ;
                                if (sum > 32767) {
                                    sum = 32767
                                }
                                ;

                                if (ch == 0) {
                                    out_l.push(sum / 33000)
                                }
                                ;
                                if (ch == 1) {
                                    out_r.push(sum / 33000)
                                }
                                ;
                            }
                        } // end of synthesis channel loop
                    } // end of synthesis sub-block loop
                } // decoding of the granule finished
            }
            return frame_size;
        }

    };


// ----------------------------------------------------------------------------
// Bit Reader 

    var BitReader = function () {
        this.bytes = null;
        this.length = 0;
        this.writePos = 0;
        this.index = 0;
    };

    BitReader.prototype.restart = function (u8arr) {
        this.bytes = u8arr;
        this.length = this.bytes.length;
        this.writePos = this.bytes.length;
        this.index = 0;
    }

    BitReader.prototype.nextBits = function (count) {
        var byteOffset = this.index >> 3;
        var room = (8 - this.index % 8);

        if (room >= count) {
            return (this.bytes[byteOffset] >> (room - count)) & (0xff >> (8 - count));
        }

        var leftover = (this.index + count) % 8; // Leftover bits in last byte
        var end = (this.index + count - 1) >> 3;
        var value = this.bytes[byteOffset] & (0xff >> (8 - room)); // Fill out first byte

        for (byteOffset++; byteOffset < end; byteOffset++) {
            value <<= 8; // Shift and
            value |= this.bytes[byteOffset]; // Put next byte
        }

        if (leftover > 0) {
            value <<= leftover; // Make room for remaining bits
            value |= (this.bytes[byteOffset] >> (8 - leftover));
        }
        else {
            value <<= 8;
            value |= this.bytes[byteOffset];
        }

        return value;
    };

    BitReader.prototype.getBits = function (count) {
        var value = this.nextBits(count);
        this.index += count;
        return value;
    };

    BitReader.prototype.advance = function (count) {
        return (this.index += count);
    };

    BitReader.prototype.rewind = function (count) {
        return (this.index -= count);
    };

})(window);