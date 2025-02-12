FROM python:3-alpine

WORKDIR /app

RUN pip install --upgrade pip
RUN pip install flask
RUN pip install gunicorn
RUN pip install psycopg2-binary

COPY . .

ENV FLASK_APP=app.py
ENV PYTHONDONTWRITEBYTECODE=1
ENV FLASK_DEBUG=1
# Dati per db
ENV DB_HOST=postgres
ENV DB_NAME=dati
ENV DB_USER=psqluser
ENV DB_PASSWORD=passpostgres

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
