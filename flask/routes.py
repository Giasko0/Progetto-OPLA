from flask import Blueprint, render_template, request, redirect

routes_bp = Blueprint('routes', __name__)

@routes_bp.route('/flask')
def home():
    return render_template("index.html")

@routes_bp.route('/flask/mieiEsami')
def mieiEsami():
    username = request.cookies.get('username')
    if not username:
        return redirect('/flask/login')
    return render_template("mieiEsami.html")