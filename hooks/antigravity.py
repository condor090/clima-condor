#!/usr/bin/env python3
# Cuota de Antigravity: la última copia que guardó la app de escritorio (userStatus, protobuf en base64)
import base64, json, os, pathlib, sqlite3, struct, sys

# La ruta llega del mod según el sistema; sin ella, la de macOS
DB = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Library/Application Support/Antigravity/User/globalStorage/state.vscdb')


def varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        s += 7
        if c < 128:
            return r, i


def campos(b):
    i, out = 0, []
    while i < len(b):
        k, i = varint(b, i)
        f, t = k >> 3, k & 7
        if t == 0:
            v, i = varint(b, i)
        elif t == 1:
            v = struct.unpack('<d', b[i:i + 8])[0]
            i += 8
        elif t == 5:
            v = struct.unpack('<f', b[i:i + 4])[0]
            i += 4
        elif t == 2:
            n, i = varint(b, i)
            v = b[i:i + n]
            i += n
        else:
            raise ValueError('tipo desconocido')
        out.append((f, v))
    return out


def primero(cs, f):
    return next((v for k, v in cs if k == f), None)


def leer():
    # as_uri arma file:///C:/… en Windows y escapa los espacios de Application Support
    con = sqlite3.connect(pathlib.Path(DB).resolve().as_uri() + '?mode=ro', uri=True)
    fila = con.execute("select value from ItemTable where key='antigravityUnifiedStateSync.userStatus'").fetchone()
    if not fila:
        return None
    # Sobre: {1: {1: clave, 2: {1: base64 del UserStatus}}}
    sobre = campos(primero(campos(base64.b64decode(fila[0])), 1))
    estado = campos(base64.b64decode(primero(campos(primero(sobre, 2)), 1)))
    plan = None
    nivel = primero(estado, 36)
    if nivel:
        plan = (primero(campos(nivel), 2) or b'').decode() or None
    modelos = []
    for f, v in estado:
        if f != 33:
            continue
        for g, m in campos(v):
            if g != 1:
                continue
            cm = campos(m)
            nombre = (primero(cm, 1) or b'').decode()
            cuota = primero(cm, 15)
            if not nombre or cuota is None:
                continue
            cq = campos(cuota)
            restante = primero(cq, 1)
            reinicio = primero(cq, 2)
            seg = primero(campos(reinicio), 1) if reinicio else None
            modelos.append({'nombre': nombre, 'restante': restante if restante is not None else 0.0, 'reinicio': seg})
    return {'plan': plan, 'guardado': int(os.path.getmtime(DB)), 'modelos': modelos}


try:
    print(json.dumps(leer()))
except Exception:
    print('null')
    sys.exit(0)
