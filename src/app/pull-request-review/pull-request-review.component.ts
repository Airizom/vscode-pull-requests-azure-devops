import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-pull-request-review',
  templateUrl: './pull-request-review.component.html',
  styleUrls: ['./pull-request-review.component.scss']
})
export class PullRequestReviewComponent implements OnInit {

  test: string = '';
  constructor() { }

  ngOnInit(): void {
    const someVar = 'ts';
  }

}
